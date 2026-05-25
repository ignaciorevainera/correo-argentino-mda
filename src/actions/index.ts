import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db } from "@db/index";
import { qualityAudits, auditParameters, auditScores, monthlySummaries } from "@db/schema";
import { eq } from "drizzle-orm";

export const server = {
  saveAudit: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().optional().transform(v => v ? parseInt(v, 10) : undefined),
      agentId: z.string().transform(v => parseInt(v, 10)),
      callId: z.string().min(1, "El ID de llamada es requerido"),
      ticketId: z.string().min(1, "El ID de ticket es requerido"),
      duration: z.string().min(1, "La duración es requerida"),
      date: z.string().min(1, "La fecha es requerida"),
      month: z.string().min(1, "El período es requerido"),
      notes: z.string().optional().default(""),
      isCriticalFailure: z.any().transform(v => v === "on"),
    }).passthrough(),
    handler: async (input) => {
      // 1. Obtener todos los parámetros dinámicos
      const allParams = await db.select().from(auditParameters);

      // 2. Preparar el listado de scores y calcular pesos ponderados
      const scoresToInsert: { parameterId: number; score: boolean }[] = [];
      let s1CheckedWeight = 0;
      let s1TotalWeight = 0;
      let s2CheckedWeight = 0;
      let s2TotalWeight = 0;

      for (const param of allParams) {
        const isChecked = (input as any)[param.code] === "on" || (input as any)[param.code] === true;
        scoresToInsert.push({
          parameterId: param.id,
          score: isChecked,
        });

        if (param.category === "Interacción con Usuario") {
          s1TotalWeight += param.weight;
          if (isChecked) s1CheckedWeight += param.weight;
        } else if (param.category === "Gestión del Ticket") {
          s2TotalWeight += param.weight;
          if (isChecked) s2CheckedWeight += param.weight;
        }
      }

      // Calcular scores basados en pesos
      const section1Score = s1TotalWeight > 0 ? Math.round((s1CheckedWeight / s1TotalWeight) * 100) : 0;
      const section2Score = s2TotalWeight > 0 ? Math.round((s2CheckedWeight / s2TotalWeight) * 100) : 0;
      const totalScore = Math.round((section1Score + section2Score) / 2);

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
          // Actualizar auditoría principal
          await db.update(qualityAudits)
            .set(auditData)
            .where(eq(qualityAudits.id, input.id));

          // Actualizar scores (eliminar viejos e insertar nuevos)
          await db.delete(auditScores).where(eq(auditScores.auditId, input.id));
          if (scoresToInsert.length > 0) {
            await db.insert(auditScores).values(
              scoresToInsert.map(s => ({ auditId: input.id!, ...s }))
            );
          }
          return { success: true, id: input.id };
        } else {
          // Insertar nueva auditoría
          const [inserted] = await db.insert(qualityAudits)
            .values(auditData)
            .returning({ id: qualityAudits.id });

          if (scoresToInsert.length > 0) {
            await db.insert(auditScores).values(
              scoresToInsert.map(s => ({ auditId: inserted.id, ...s }))
            );
          }
          return { success: true, id: inserted.id };
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
      summary: z.string()
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
