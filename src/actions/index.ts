import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db } from "@db/index";
import { qualityAudits, auditParameters, auditScores, monthlySummaries } from "@db/schema";
import { eq } from "drizzle-orm";
import { calculateAuditScores } from "../lib/qualityCalculator";

export const server = {
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
      // 1. Obtener todos los parámetros dinámicos
      const allParams = await db.select().from(auditParameters);

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
