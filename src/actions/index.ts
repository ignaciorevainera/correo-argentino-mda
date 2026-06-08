import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db } from "@db/index";
import { qualityAudits, auditParameters, auditScores, monthlySummaries } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import { calculateAuditScores } from "../lib/qualityCalculator";

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
    handler: async (input) => {
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
        db.transaction((tx) => {
          for (const param of input.parameters) {
            if (param.id) {
              // Existing parameter
              if (param.isDeleted) {
                // Check if used in auditScores
                const scores = tx.select()
                  .from(auditScores)
                  .where(eq(auditScores.parameterId, param.id))
                  .limit(1)
                  .all();
                const hasScores = scores.length > 0;

                if (!hasScores) {
                  // Hard delete
                  tx.delete(auditParameters)
                    .where(eq(auditParameters.id, param.id))
                    .run();
                } else {
                  // Soft delete
                  tx.update(auditParameters)
                    .set({ active: false })
                    .where(eq(auditParameters.id, param.id))
                    .run();
                }
              } else {
                // Edit parameter
                const [current] = tx.select()
                  .from(auditParameters)
                  .where(eq(auditParameters.id, param.id))
                  .all();

                if (current) {
                  const changed = current.name !== param.name || 
                                  current.weight !== param.weight || 
                                  current.category !== param.category;

                  if (changed) {
                    // Check if used in auditScores
                    const scores = tx.select()
                      .from(auditScores)
                      .where(eq(auditScores.parameterId, param.id))
                      .limit(1)
                      .all();
                    const hasScores = scores.length > 0;

                    if (!hasScores) {
                      // Edit in-place
                      tx.update(auditParameters)
                        .set({
                          name: param.name,
                          weight: param.weight,
                          category: param.category
                        })
                        .where(eq(auditParameters.id, param.id))
                        .run();
                    } else {
                      // Soft delete current and insert new version
                      tx.update(auditParameters)
                        .set({ active: false })
                        .where(eq(auditParameters.id, param.id))
                        .run();

                      const newCode = generateCode(param.name);
                      tx.insert(auditParameters)
                        .values({
                          code: newCode,
                          name: param.name,
                          weight: param.weight,
                          category: param.category,
                          active: true
                        })
                        .run();
                    }
                  }
                }
              }
            } else if (!param.isDeleted) {
              // New parameter
              const newCode = generateCode(param.name);
              tx.insert(auditParameters)
                .values({
                  code: newCode,
                  name: param.name,
                  weight: param.weight,
                  category: param.category,
                  active: true
                })
                .run();
            }
          }
        });
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
    handler: async (input) => {
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
    handler: async (input) => {
      try {
        await db.delete(qualityAudits).where(eq(qualityAudits.id, input.id));
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
    handler: async (input) => {
      try {
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
        return { success: true };
      } catch (error: any) {
        console.error("Error saving month summary:", error);
        throw new Error(error.message || "Error al guardar el resumen del mes");
      }
    }
  })
};
