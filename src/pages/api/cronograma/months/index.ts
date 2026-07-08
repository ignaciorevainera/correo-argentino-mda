import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { and, eq, like, inArray } from "drizzle-orm";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

const MONTH_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { year, month } = body; // month is 0-indexed (0 = Enero)

    if (year === undefined || month === undefined) {
      return jsonResponse({ error: "Year and month are required" }, 400);
    }

    // 1. Fetch all agents (operators) from SQLite to get all operators
    const dbAgents = await db.select({ name: agents.name }).from(agents);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 2. Generate and write schedules for all operators (single transaction)
    await db.transaction((tx) => {
      // Batch delete: remove all existing schedules for this month across all agents
      tx.delete(schedules).where(
        and(
          inArray(schedules.agentName, dbAgents.map(a => a.name)),
          like(schedules.date, `${monthPrefix}-%`)
        )
      ).run();

      // Batch insert: generate all day schedules for all agents
      const allInserts = [];
      for (const op of dbAgents) {
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          allInserts.push({
            agentName: op.name,
            date: dateStr,
            status: "Franco",
            comment: "",
            horario: "",
            entradaReal: "",
            salidaReal: "",
            breakInicio: "",
            breakFin: "",
            isOverride: false,
          });
        }
      }

      // Chunk inserts to avoid SQLite parameter limit (~999 variables)
      const CHUNK_SIZE = 100;
      for (let i = 0; i < allInserts.length; i += CHUNK_SIZE) {
        tx.insert(schedules).values(allInserts.slice(i, i + CHUNK_SIZE)).run();
      }
    });

    await logAdminFromAstro(locals,
      `Generó el cronograma del mes ${MONTH_LABELS[month] || month} ${year}`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Months API Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { year, month } = body; // month is 0-indexed (0 = Enero)

    if (year === undefined || month === undefined) {
      return jsonResponse({ error: "Year and month are required" }, 400);
    }

    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 1. Delete from database schedules for this month
    await db.delete(schedules).where(
      like(schedules.date, `${monthPrefix}-%`)
    );

    await logAdminFromAstro(locals,
      `Eliminó el cronograma del mes de ${MONTH_LABELS[month] || month} ${year}`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("DELETE Months API Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
