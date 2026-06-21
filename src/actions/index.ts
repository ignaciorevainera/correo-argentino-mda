import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { requireWriteAccess } from "../lib/rbac-middleware";
import { db } from "@db/index";
import { agents, qualityAudits, auditParameters, auditScores, monthlySummaries } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import { calculateAuditScores } from "../lib/qualityCalculator";
import { logAdminAction } from "@lib/auditLogger";

export const server = {
  saveParameters: defineAction({
    input: z.object({
      parameters: z.array(z.object({
        id: z.number().optional().nullable(),
        name: z.string().min(1, "El nombre es requerido"),
        weight: z.number().min(0, "El peso debe ser mayor o igual a 0"),
        category: z.string().min(1, "La categoría es requerida"),
        isDeleted: z.boolean().optional().default(false),
      }))
    }),
    handler: async (input, context) => {
      const denied = requireWriteAccess(context.locals, "calidad");
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
        const inputIds = input.parameters.map(p => p.id).filter((id): id is number => id !== null && id !== undefined);

        // 1. Pre-cargar datos si hay IDs existentes
        let existingParamsMap = new Map();
        let paramsWithScoresSet = new Set<number>();

        if (inputIds.length > 0) {
          const existingParams = await db.select()
            .from(auditParameters)
            .where(inArray(auditParameters.id, inputIds));
            
          existingParams.forEach(p => existingParamsMap.set(p.id, p));

          const scores = await db.select({ parameterId: auditScores.parameterId })
            .from(auditScores)
            .where(inArray(auditScores.parameterId, inputIds));
            
          scores.forEach(s => paramsWithScoresSet.add(s.parameterId));
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
                const changed = current.name !== param.name || 
                                current.weight !== param.weight || 
                                current.category !== param.category;
                
                if (changed) {
                  if (!paramsWithScoresSet.has(param.id)) {
                    // Update in-place
                    updates.push({
                      id: param.id,
                      name: param.name,
                      weight: param.weight,
                      category: param.category
                    });
                  } else {
                    // Soft delete current and insert new version
                    softDeletes.push(param.id);
                    inserts.push({
                      code: generateCode(param.name),
                      name: param.name,
                      weight: param.weight,
                      category: param.category,
                      active: true
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
              active: true
            });
          }
        }

        // 3. Ejecutar bloque transaccional rápido (Write-only)
        db.transaction((tx) => {
          if (hardDeletes.length > 0) {
            tx.delete(auditParameters).where(inArray(auditParameters.id, hardDeletes)).run();
          }
          
          if (softDeletes.length > 0) {
            tx.update(auditParameters).set({ active: false }).where(inArray(auditParameters.id, softDeletes)).run();
          }
          
          if (inserts.length > 0) {
            tx.insert(auditParameters).values(inserts).run();
          }
          
          for (const up of updates) {
            tx.update(auditParameters).set({
              name: up.name,
              weight: up.weight,
              category: up.category
            }).where(eq(auditParameters.id, up.id)).run();
          }
        });
        
        await logAdminAction(
          (context.locals as any).user?.username || 'Sistema',
          `Actualizó la configuración de parámetros de calidad`
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error saving parameters:", error);
        throw new Error(error.message || "Error al guardar los parámetros");
      }
    }
  }),

  saveAudit: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().nullable().optional().transform(v => v ? parseInt(v, 10) : undefined),
      agentId: z.string().transform(v => parseInt(v, 10)),
      callId: z.string().min(1, "El ID de llamada es requerido"),
      ticketId: z.string().min(1, "El ID de ticket es requerido"),
      duration: z.string().min(1, "La duración es requerida"),
      date: z.string().min(1, "La fecha es requerida"),
      month: z.string().min(1, "El período es requerido"),
      notes: z.preprocess(v => (v == null ? "" : String(v)), z.string()).optional().default(""),
      isCriticalFailure: z.any().transform(v => v === "on" || v === true || v === "true" || v === 1 || v === "1"),
    }).passthrough(),
    handler: async (input, context) => {
      const denied = requireWriteAccess(context.locals, "calidad");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para guardar auditorías.",
        });
      }
      // 1. Obtener los parámetros correspondientes
      let allParams;
      if (input.id) {
        const existingScores = await db.select()
          .from(auditScores)
          .where(eq(auditScores.auditId, input.id));
        const paramIds = existingScores.map(s => s.parameterId);
        if (paramIds.length > 0) {
          allParams = await db.select()
            .from(auditParameters)
            .where(inArray(auditParameters.id, paramIds));
        } else {
          allParams = await db.select()
            .from(auditParameters)
            .where(eq(auditParameters.active, true));
        }
      } else {
        allParams = await db.select()
          .from(auditParameters)
          .where(eq(auditParameters.active, true));
      }

      // 2. Preparar el listado de scores y recopilar códigos seleccionados
      const scoresToInsert: { parameterId: number; score: boolean }[] = [];
      const checkedCodes = new Set<string>();

      for (const param of allParams) {
        const isChecked = (input as any)[param.code] === "on" || (input as any)[param.code] === true || (input as any)[param.code] === "true";
        if (isChecked) {
          checkedCodes.add(param.code);
        }
        scoresToInsert.push({
          parameterId: param.id,
          score: isChecked,
        });
      }

      // 3. Calcular scores ponderados usando la utilidad compartida
      const { section1Score, section2Score, totalScore } = calculateAuditScores(
        allParams,
        checkedCodes,
        input.isCriticalFailure
      );

      const auditData = {
        agentId: input.agentId,
        callId: input.callId,
        ticketId: input.ticketId,
        duration: input.duration,
        date: input.date,
        month: input.month,
        section1Score,
        section2Score,
        totalScore,
        notes: input.notes,
        isCriticalFailure: input.isCriticalFailure,
      };

      const [agentForAudit] = await db
        .select({ name: agents.name })
        .from(agents)
        .where(eq(agents.id, input.agentId))
        .limit(1);
      const agentName = agentForAudit?.name || `ID ${input.agentId}`;

      try {
        if (input.id) {
          db.transaction((tx) => {
            // Actualizar auditoría principal
            tx.update(qualityAudits)
              .set(auditData)
              .where(eq(qualityAudits.id, input.id!))
              .run();

            // Actualizar scores (eliminar viejos e insertar nuevos)
            tx.delete(auditScores).where(eq(auditScores.auditId, input.id!)).run();
            if (scoresToInsert.length > 0) {
              tx.insert(auditScores).values(
                scoresToInsert.map(s => ({ auditId: input.id!, ...s }))
              ).run();
            }
          });
          await logAdminAction(
            (context.locals as any).user?.username || 'Sistema',
            `Actualizó auditoría de calidad para "${agentName}" (call ${input.callId})`
          );
          return { success: true, id: input.id };
        } else {
          let insertedId: number;
          db.transaction((tx) => {
            // Insertar nueva auditoría
            const [inserted] = tx.insert(qualityAudits)
              .values(auditData)
              .returning({ id: qualityAudits.id })
              .all();

            insertedId = inserted.id;

            if (scoresToInsert.length > 0) {
              tx.insert(auditScores).values(
                scoresToInsert.map(s => ({ auditId: inserted.id, ...s }))
              ).run();
            }
          });
          await logAdminAction(
            (context.locals as any).user?.username || 'Sistema',
            `Guardó auditoría de calidad para "${agentName}" (call ${input.callId})`
          );
          return { success: true, id: insertedId! };
        }
      } catch (error: any) {
        console.error("Error saving audit:", error);
        throw new Error(error.message || "Error al guardar la auditoría");
      }
    }
  }),

  deleteAudit: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().transform(v => parseInt(v, 10)),
    }),
    handler: async (input, context) => {
      const denied = requireWriteAccess(context.locals, "calidad");
      if (denied) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "No tiene permisos para eliminar auditorías.",
        });
      }
      try {
        const [auditToDelete] = await db
          .select({ agentId: qualityAudits.agentId, callId: qualityAudits.callId })
          .from(qualityAudits)
          .where(eq(qualityAudits.id, input.id))
          .limit(1);

        let agentName = `ID ${auditToDelete?.agentId || 'desconocido'}`;
        if (auditToDelete?.agentId) {
          const [agent] = await db
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, auditToDelete.agentId))
            .limit(1);
          if (agent) agentName = agent.name;
        }

        await db.delete(qualityAudits).where(eq(qualityAudits.id, input.id));

        await logAdminAction(
          (context.locals as any).user?.username || 'Sistema',
          `Eliminó auditoría de calidad de "${agentName}" (call ${auditToDelete?.callId || input.id})`
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error deleting audit:", error);
        throw new Error(error.message || "Error al eliminar la auditoría");
      }
    }
  }),

  saveMonthSummary: defineAction({
    accept: "form",
    input: z.object({
      agentId: z.string().transform(v => parseInt(v, 10)),
      month: z.string().min(1),
      summary: z.preprocess(v => (v == null ? "" : String(v)), z.string()).optional().default(""),
    }),
    handler: async (input, context) => {
      const denied = requireWriteAccess(context.locals, "calidad");
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
        await db.insert(monthlySummaries)
          .values({
            agentId: input.agentId,
            month: input.month,
            summary: input.summary
          })
          .onConflictDoUpdate({
            target: [monthlySummaries.agentId, monthlySummaries.month],
            set: { summary: input.summary }
          });

        await logAdminAction(
          (context.locals as any).user?.username || 'Sistema',
          `Guardó observaciones de calidad de "${agentName}" (${input.month})`
        );

        return { success: true };
      } catch (error: any) {
        console.error("Error saving month summary:", error);
        throw new Error(error.message || "Error al guardar el resumen del mes");
      }
    }
  })
};
