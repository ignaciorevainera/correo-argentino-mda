import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { and, eq, like } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";

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

    // 2. Generate and write schedules for all operators
    for (const op of dbAgents) {
      const agentName = op.name;
      
      // Delete existing DB schedules for this agent and month to avoid duplicates
      await db.delete(schedules).where(
        and(
          eq(schedules.agentName, agentName),
          like(schedules.date, `${monthPrefix}-%`)
        )
      );

      // Generate day schedules
      const inserts = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        // Initialize empty/blank (Franco modality, empty schedule)
        inserts.push({
          agentName,
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

      // Insert all generated schedules for this operator
      if (inserts.length > 0) {
        await db.insert(schedules).values(inserts);
      }
    }

    await logAdminAction(
      (locals as any).user?.username || 'Sistema',
      `Generó el cronograma del mes ${MONTH_LABELS[month] || month} ${year}`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Months API Error:", error);
    return jsonResponse({ error: error.message }, 500);
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

    await logAdminAction(
      (locals as any).user?.username || 'Sistema',
      `Eliminó el cronograma del mes de ${MONTH_LABELS[month] || month} ${year}`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("DELETE Months API Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
