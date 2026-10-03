import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { db } from "@db/index";
import {
  agents,
  qualityAudits,
  auditParameters,
  auditScores,
  monthlySummaries,
  feedback,
} from "@db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { calculateAuditScores, calculateMultiChannelAuditScores } from "@lib/qualityCalculator";
import { logAdminFromAstro } from "@lib/auditLogger";
import {
  invalidateAutomationDetail,
  resolveAutomationDetail,
} from "@lib/workflow/resolver";
import { invalidateDiscoveryCache } from "@lib/workflow/discovery";
import { isActiveStatus } from "@lib/workflow/automation-status";
import {
  DEFAULT_CLOSE_REASON,
  canManualClose,
  getCloseThreshold,
  getClosure,
  recordClosure,
  removeClosure,
} from "@lib/workflow/closures";
import { saveManualData } from "@lib/workflow/manual-data";

export const server = {
  saveParameters: defineAction({
    input: z.object({
      parameters: z.array(
        z.object({
          id: z.number().optional().nullable(),
          name: z.string().min(1, "El nombre es requerido"),
          weight: z.number().min(0, "El peso debe ser mayor o igual a 0"),
          category: z.string().min(1, "La categoría es requerida"),
          channel: z.enum(["wise_call", "wise_email", "invgate_ticket"]).optional().default("wise_call"),
          section: z.enum(["items", "ticket", "mda"]).optional().default("items"),
          isDeleted: z.boolean().optional().default(false),
        }),
      ),
    }),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "calidad");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para modificar parámetros de calidad.",
        });
      }
      const generateCode = (name: string): string => {
        const base = name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");
        const randomSuffix = Math.random().toString(36).substring(2, 7);
        return `${base.substring(0, 15) || "param"}_${randomSuffix}`;
      };

      try {
        const inputIds = input.parameters
          .map((p) => p.id)
          .filter((id): id is number => id !== null && id !== undefined);

        // 1. Pre-cargar datos si hay IDs existentes
        let existingParamsMap = new Map();
        let paramsWithScoresSet = new Set<number>();

        if (inputIds.length > 0) {
          const existingParams = await db
            .select()
            .from(auditParameters)
            .where(inArray(auditParameters.id, inputIds));

          existingParams.forEach((p) => existingParamsMap.set(p.id, p));

          const scores = await db
            .select({ parameterId: auditScores.parameterId })
            .from(auditScores)
            .where(inArray(auditScores.parameterId, inputIds));

          scores.forEach((s) => paramsWithScoresSet.add(s.parameterId));
        }

        // 2. Clasificar operaciones
        const hardDeletes: number[] = [];
        const softDeletes: number[] = [];
        const inserts: any[] = [];
        const updates: any[] = [];

        for (const param of input.parameters) {
          if (param.id) {
            if (param.isDeleted) {
              if (!paramsWithScoresSet.has(param.id)) {
                hardDeletes.push(param.id);
              } else {
                softDeletes.push(param.id);
              }
            } else {
              const current = existingParamsMap.get(param.id);
              if (current) {
                const changed =
                  current.name !== param.name ||
                  current.weight !== param.weight ||
                  current.category !== param.category ||
                  (param.channel && current.channel !== param.channel) ||
                  (param.section && current.section !== param.section);

                if (changed) {
                  if (!paramsWithScoresSet.has(param.id)) {
                    // Update in-place
                    updates.push({
                      id: param.id,
                      name: param.name,
                      weight: param.weight,
                      category: param.category,
                      channel: param.channel || current.channel,
                      section: param.section || current.section,
                    });
                  } else {
                    // Soft delete current and insert new version
                    softDeletes.push(param.id);
                    inserts.push({
                      code: generateCode(param.name),
                      name: param.name,
                      weight: param.weight,
                      category: param.category,
                      channel: param.channel || current.channel,
                      section: param.section || current.section,
                      active: true,
                    });
                  }
                }
              }
            }
          } else if (!param.isDeleted) {
            // New parameter
            inserts.push({
              code: generateCode(param.name),
              name: param.name,
              weight: param.weight,
              category: param.category,
              channel: param.channel || "wise_call",
              section: param.section || "items",
              active: true,
            });
          }
        }

        // 3. Ejecutar bloque transaccional rápido (Write-only)
        await db.transaction((tx) => {
          if (hardDeletes.length > 0) {
            tx.delete(auditParameters)
              .where(inArray(auditParameters.id, hardDeletes))
              .run();
          }

          if (softDeletes.length > 0) {
            tx.update(auditParameters)
              .set({ active: false })
              .where(inArray(auditParameters.id, softDeletes))
              .run();
          }

          if (inserts.length > 0) {
            tx.insert(auditParameters).values(inserts).run();
          }

          for (const up of updates) {
            tx.update(auditParameters)
              .set({
                name: up.name,
                weight: up.weight,
                category: up.category,
                channel: up.channel,
                section: up.section,
              })
              .where(eq(auditParameters.id, up.id))
              .run();
          }
        });

        await logAdminFromAstro(
          context.locals,
          `Actualizó la configuración de parámetros de calidad`,
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error saving parameters:", error);
        throw new Error(error.message || "Error al guardar los parámetros");
      }
    },
  }),

  saveAudit: defineAction({
    accept: "form",
    input: z
      .object({
        id: z
          .string()
          .nullable()
          .optional()
          .transform((v) => (v ? parseInt(v, 10) : undefined)),
        agentId: z.string().transform((v) => parseInt(v, 10)),
        channelType: z
          .enum(["wise_call", "wise_email", "invgate_ticket"])
          .default("wise_call"),
        callId: z.string().default(""), // ID / Case Number
        ticketId: z.string().default(""), // Ticket ID
        duration: z.string().default("00:00"),
        date: z.string().min(1, "La fecha es requerida"),
        month: z.string().min(1, "El período es requerido"),
        notes: z
          .preprocess((v) => (v == null ? "" : String(v)), z.string())
          .optional()
          .default(""),
        ringTime: z.string().optional().nullable(),
        creationTime: z.string().optional().nullable(),
        takeTime: z.string().optional().nullable(),
        recordingUrl: z.string().optional().nullable(),
        isPas: z
          .any()
          .transform(
            (v) =>
              v === "on" || v === true || v === "true" || v === 1 || v === "1",
          )
          .default(false),
        callGeneratedTicket: z
          .any()
          .transform(
            (v) =>
              v === "on" || v === true || v === "true" || v === 1 || v === "1",
          )
          .default(true),
        appliesMda: z
          .any()
          .transform(
            (v) =>
              v === "on" || v === true || v === "true" || v === 1 || v === "1",
          )
          .default(false),
        staysInMda: z
          .any()
          .transform(
            (v) =>
              v === "on" || v === true || v === "true" || v === 1 || v === "1",
          )
          .default(true),
        isCriticalFailure: z
          .any()
          .transform(
            (v) =>
              v === "on" || v === true || v === "true" || v === 1 || v === "1",
          )
          .default(false),
      })
      .passthrough(),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "calidad");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para guardar auditorías.",
        });
      }
      // 1. Obtener los parámetros activos correspondientes al canal
      let allParams = await db
        .select()
        .from(auditParameters)
        .where(
          and(
            eq(auditParameters.active, true),
            eq(auditParameters.channel, input.channelType),
          ),
        )
        .orderBy(auditParameters.order);

      // Si por alguna razón no hay parámetros específicos del canal, fallback a los activos
      if (!allParams || allParams.length === 0) {
        allParams = await db
          .select()
          .from(auditParameters)
          .where(eq(auditParameters.active, true))
          .orderBy(auditParameters.order);
      }

      // 2. Determinar si aplica Sección 2
      let hasSection2 = true;
      if (input.channelType === "wise_call") {
        hasSection2 = input.callGeneratedTicket;
      } else if (input.channelType === "wise_email") {
        hasSection2 = input.appliesMda;
      } else if (input.channelType === "invgate_ticket") {
        hasSection2 = input.staysInMda;
      }

      // Si la Sección 2 no aplica, solo evaluamos y persistimos los parámetros de la Sección 1 ("items")
      const applicableParams = hasSection2
        ? allParams
        : allParams.filter((p) =>
            p.section
              ? p.section === "items"
              : p.category === "Items" || p.category === "Interacción con Usuario",
          );

      // 3. Preparar el listado de scores y recopilar códigos seleccionados
      const scoresToInsert: {
        parameterId: number;
        score: boolean;
        comment: string | null;
      }[] = [];
      const checkedCodes = new Set<string>();

      for (const param of applicableParams) {
        const isChecked =
          (input as any)[param.code] === "on" ||
          (input as any)[param.code] === true ||
          (input as any)[param.code] === "true";
        const comment = (input as any)[`${param.code}_comment`] || null;

        if (isChecked) {
          checkedCodes.add(param.code);
        }
        scoresToInsert.push({
          parameterId: param.id,
          score: isChecked,
          comment: typeof comment === "string" ? comment.trim() : null,
        });
      }

      // 4. Calcular scores ponderados usando el nuevo motor multi-canal
      const { section1Score, section2Score, totalScore } =
        calculateMultiChannelAuditScores(
          input.channelType,
          allParams,
          checkedCodes,
          hasSection2,
          input.isCriticalFailure,
        );

      const auditData = {
        agentId: input.agentId,
        channelType: input.channelType,
        callId: input.callId || (input.channelType === "invgate_ticket" ? input.ticketId : ""),
        ticketId: input.ticketId,
        duration: input.duration,
        date: input.date,
        month: input.month,
        section1Score,
        section2Score,
        totalScore,
        notes: input.notes,
        ringTime: input.ringTime || null,
        creationTime: input.creationTime || null,
        takeTime: input.takeTime || null,
        isPas: input.isPas,
        appliesMda: input.channelType === "wise_call" ? hasSection2 : input.appliesMda,
        staysInMda: input.staysInMda,
        isCriticalFailure: input.isCriticalFailure,
        recordingUrl: input.recordingUrl || null,
      };

      const [agentForAudit] = await db
        .select({ name: agents.name })
        .from(agents)
        .where(eq(agents.id, input.agentId))
        .limit(1);
      const agentName = agentForAudit?.name || `ID ${input.agentId}`;

      try {
        if (input.id) {
          await db.transaction((tx) => {
            // Actualizar auditoría principal
            tx.update(qualityAudits)
              .set(auditData)
              .where(eq(qualityAudits.id, input.id!))
              .run();

            // Actualizar scores (eliminar viejos e insertar nuevos)
            tx.delete(auditScores)
              .where(eq(auditScores.auditId, input.id!))
              .run();
            if (scoresToInsert.length > 0) {
              tx.insert(auditScores)
                .values(
                  scoresToInsert.map((s) => ({ auditId: input.id!, ...s })),
                )
                .run();
            }
          });
          await logAdminFromAstro(
            context.locals,
            `Actualizó auditoría de calidad para "${agentName}" (call ${input.callId})`,
          );
          return { success: true, id: input.id };
        } else {
          let insertedId: number;
          await db.transaction((tx) => {
            // Insertar nueva auditoría
            const [inserted] = tx
              .insert(qualityAudits)
              .values(auditData)
              .returning({ id: qualityAudits.id })
              .all();

            insertedId = inserted.id;

            if (scoresToInsert.length > 0) {
              tx.insert(auditScores)
                .values(
                  scoresToInsert.map((s) => ({ auditId: inserted.id, ...s })),
                )
                .run();
            }
          });
          await logAdminFromAstro(
            context.locals,
            `Guardó auditoría de calidad para "${agentName}" (call ${input.callId})`,
          );
          return { success: true, id: insertedId! };
        }
      } catch (error: any) {
        console.error("Error saving audit:", error);
        throw new Error(error.message || "Error al guardar la auditoría");
      }
    },
  }),

  deleteAudit: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().transform((v) => parseInt(v, 10)),
    }),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "calidad");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para eliminar auditorías.",
        });
      }
      try {
        const [auditToDelete] = await db
          .select({
            agentId: qualityAudits.agentId,
            callId: qualityAudits.callId,
          })
          .from(qualityAudits)
          .where(eq(qualityAudits.id, input.id))
          .limit(1);

        let agentName = `ID ${auditToDelete?.agentId || "desconocido"}`;
        if (auditToDelete?.agentId) {
          const [agent] = await db
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, auditToDelete.agentId))
            .limit(1);
          if (agent) agentName = agent.name;
        }

        await db.delete(qualityAudits).where(eq(qualityAudits.id, input.id));

        await logAdminFromAstro(
          context.locals,
          `Eliminó auditoría de calidad de "${agentName}" (call ${auditToDelete?.callId || input.id})`,
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error deleting audit:", error);
        throw new Error(error.message || "Error al eliminar la auditoría");
      }
    },
  }),

  saveMonthSummary: defineAction({
    accept: "form",
    input: z.object({
      agentId: z.string().transform((v) => parseInt(v, 10)),
      month: z.string().min(1),
      summary: z
        .preprocess((v) => (v == null ? "" : String(v)), z.string())
        .optional()
        .default(""),
    }),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "calidad");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para guardar resúmenes mensuales.",
        });
      }
      try {
        const [agentForSummary] = await db
          .select({ name: agents.name })
          .from(agents)
          .where(eq(agents.id, input.agentId))
          .limit(1);
        const agentName = agentForSummary?.name || `ID ${input.agentId}`;

        // We use insert with onConflictDoUpdate since we have a composite PK
        await db
          .insert(monthlySummaries)
          .values({
            agentId: input.agentId,
            month: input.month,
            summary: input.summary,
          })
          .onConflictDoUpdate({
            target: [monthlySummaries.agentId, monthlySummaries.month],
            set: { summary: input.summary },
          });

        await logAdminFromAstro(
          context.locals,
          `Guardó observaciones de calidad de "${agentName}" (${input.month})`,
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error saving month summary:", error);
        throw new Error(error.message || "Error al guardar el resumen del mes");
      }
    },
  }),
  submitFeedback: defineAction({
    input: z.object({
      type: z.enum(["sugerencia", "bug"]),
      subject: z.string().min(3, "El asunto debe tener al menos 3 caracteres"),
      description: z
        .string()
        .min(10, "La descripción debe tener al menos 10 caracteres"),
      category: z.string().min(1, "El área o categoría es requerida"),
      severity: z.string().optional().nullable(),
      steps: z.string().optional().nullable(),
      userAgent: z.string().optional().nullable(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user || user.id === 0) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Debe iniciar sesión para enviar comentarios.",
        });
      }
      try {
        const [inserted] = await db
          .insert(feedback)
          .values({
            userId: user.id,
            type: input.type,
            subject: input.subject,
            description: input.description,
            category: input.category,
            severity: input.severity,
            steps: input.steps,
            userAgent: input.userAgent,
            status: "pendiente",
          })
          .returning({ id: feedback.id });

        return { success: true, feedbackId: inserted.id };
      } catch (error: any) {
        console.error("Error submitting feedback:", error);
        throw new Error(error.message || "Error al enviar el feedback.");
      }
    },
  }),
  updateFeedbackStatus: defineAction({
    input: z.object({
      feedbackId: z.number(),
      newStatus: z.enum(["pendiente", "en_revision", "resuelto", "descartado"]),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user || user.role !== "admin") {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para modificar el estado del feedback.",
        });
      }
      try {
        await db
          .update(feedback)
          .set({ status: input.newStatus })
          .where(eq(feedback.id, input.feedbackId))
          .run();

        await logAdminFromAstro(
          context.locals,
          `Actualizó el estado del reporte/sugerencia #${input.feedbackId} a "${input.newStatus}"`,
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error updating feedback status:", error);
        throw new Error(error.message || "Error al actualizar el estado.");
      }
    },
  }),
  assignFeedback: defineAction({
    input: z.object({
      feedbackId: z.number(),
      assign: z.boolean(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user || user.role !== "admin" || user.id === 0) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para asignar feedback.",
        });
      }
      try {
        const assignedToId = input.assign ? user.id : null;

        await db
          .update(feedback)
          .set({ assignedToId })
          .where(eq(feedback.id, input.feedbackId))
          .run();

        const logMessage = input.assign
          ? `Se asignó el reporte/sugerencia #${input.feedbackId} a sí mismo`
          : `Liberó la asignación del reporte/sugerencia #${input.feedbackId}`;

        await logAdminFromAstro(context.locals, logMessage);

        return { success: true };
      } catch (error: any) {
        console.error("Error assigning feedback:", error);
        throw new Error(error.message || "Error al modificar la asignación.");
      }
    },
  }),

  closeAutomation: defineAction({
    input: z.object({
      automationId: z.number().int().positive(),
      reason: z
        .string()
        .trim()
        .max(500, "El motivo no puede superar los 500 caracteres")
        .optional()
        .nullable(),
    }),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "automatizaciones");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para cerrar automatizaciones.",
        });
      }

      const result = await resolveAutomationDetail(input.automationId);
      if (!result.ok) {
        throw new ActionError({ code: "BAD_REQUEST", message: result.message });
      }

      if (getClosure(input.automationId)) {
        return { success: true, alreadyClosed: true };
      }

      if (!canManualClose(result.detail.progress.percent)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `El caso debe alcanzar al menos ${getCloseThreshold()}% de progreso para cerrarse.`,
        });
      }

      if (!isActiveStatus(result.detail.statusId)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "El caso ya está finalizado en InvGate.",
        });
      }

      const reason = input.reason?.trim() || DEFAULT_CLOSE_REASON;
      const closure = recordClosure({
        automationId: input.automationId,
        kind: "manual",
        reason,
        percent: result.detail.progress.percent,
        closedBy: context.locals.user?.username || "desconocido",
      });
      invalidateAutomationDetail(input.automationId);
      invalidateDiscoveryCache();

      await logAdminFromAstro(
        context.locals,
        `Cerró localmente la automatización ${result.detail.prettyId} (${result.detail.progress.percent}%): "${reason}"`,
      );

      return { success: true, closure };
    },
  }),

  reopenAutomation: defineAction({
    input: z.object({
      automationId: z.number().int().positive(),
    }),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "automatizaciones");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para reabrir automatizaciones.",
        });
      }

      const existing = getClosure(input.automationId);
      if (!existing) {
        return { success: true, alreadyOpen: true };
      }

      if (existing.kind === "auto") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            "El cierre es automático (flujo al 100%); no se reabre manualmente.",
        });
      }

      removeClosure(input.automationId);
      invalidateAutomationDetail(input.automationId);
      invalidateDiscoveryCache();

      await logAdminFromAstro(
        context.locals,
        `Reabrió localmente la automatización #${input.automationId}`,
      );

      return { success: true };
    },
  }),

  saveAutomationManualData: defineAction({
    input: z.object({
      automationId: z.number().int().positive(),
      jefeName: z.string().trim().max(120).optional().nullable(),
      jefeDni: z.string().trim().max(20).optional().nullable(),
      jefeLegajo: z.string().trim().max(20).optional().nullable(),
      jefeZonal: z.string().trim().max(120).optional().nullable(),
      contactNumber: z.string().trim().max(60).optional().nullable(),
      openingHours: z.string().trim().max(60).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
    }),
    handler: async (input, context) => {
      const denied = await requireWriteAccess(context.locals, "automatizaciones");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para editar los datos de la automatización.",
        });
      }

      const clean = (value: string | null | undefined): string | null =>
        value && value.length > 0 ? value : null;

      saveManualData({
        automationId: input.automationId,
        jefeName: clean(input.jefeName),
        jefeDni: clean(input.jefeDni),
        jefeLegajo: clean(input.jefeLegajo),
        jefeZonal: clean(input.jefeZonal),
        contactNumber: clean(input.contactNumber),
        openingHours: clean(input.openingHours),
        notes: clean(input.notes),
        updatedBy: context.locals.user?.username || "desconocido",
      });
      invalidateAutomationDetail(input.automationId);

      await logAdminFromAstro(
        context.locals,
        `Actualizó los datos manuales de la automatización #${input.automationId}`,
      );

      return { success: true };
    },
  }),
};
