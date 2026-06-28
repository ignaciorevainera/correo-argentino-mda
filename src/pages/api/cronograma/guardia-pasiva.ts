import type { APIRoute } from "astro";
import { db } from "@db/index";
import { monthlyGuardiaPasivaOperator, weeklyGuardiaPasivaAssignments, users } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";

const DEFAULT_SUPERVISOR = "Tomasi Alejandro";

interface PostRequestBody {
  month?: string;
  operatorId?: number | null | string;
  weeklyAssignments?: Array<{
    startDate?: string;
    endDate?: string;
    supervisorName?: string;
    referenteId?: number | null | string;
  }>;
}

// Helper para calcular los rangos de semanas Mon-Sun que intersectan con el mes YYYY-MM
function getWeeksForMonth(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0));

  const firstMonday = new Date(startOfMonth);
  const day = firstMonday.getUTCDay();
  const diff = firstMonday.getUTCDate() - day + (day === 0 ? -6 : 1);
  firstMonday.setUTCDate(diff);

  const weeks: { startDate: string; endDate: string; label: string }[] = [];
  const current = new Date(firstMonday);

  while (current <= endOfMonth) {
    const wStart = new Date(current);
    const wEnd = new Date(current);
    wEnd.setUTCDate(wStart.getUTCDate() + 6);

    const y1 = wStart.getUTCFullYear();
    const m1 = String(wStart.getUTCMonth() + 1).padStart(2, "0");
    const d1 = String(wStart.getUTCDate()).padStart(2, "0");
    const startStr = `${y1}-${m1}-${d1}`;

    const y2 = wEnd.getUTCFullYear();
    const m2 = String(wEnd.getUTCMonth() + 1).padStart(2, "0");
    const d2 = String(wEnd.getUTCDate()).padStart(2, "0");
    const endStr = `${y2}-${m2}-${d2}`;

    weeks.push({
      startDate: startStr,
      endDate: endStr,
      label: `${d1}/${m1} a ${d2}/${m2}`,
    });

    current.setUTCDate(current.getUTCDate() + 7);
  }

  return weeks;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const month = url.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return jsonResponse({ error: "Missing or invalid month parameter" }, 400);
    }

    // 1. Obtener operador mensual
    const opResult = await db
      .select()
      .from(monthlyGuardiaPasivaOperator)
      .where(eq(monthlyGuardiaPasivaOperator.month, month))
      .limit(1);
    const operatorId = opResult[0]?.operatorId || null;

    // 2. Calcular semanas del mes
    const weeks = getWeeksForMonth(month);

    // 3. Obtener asignaciones guardadas para estas semanas
    const startDates = weeks.map(w => w.startDate);
    const savedAssignments = startDates.length > 0
      ? await db
          .select()
          .from(weeklyGuardiaPasivaAssignments)
          .where(inArray(weeklyGuardiaPasivaAssignments.startDate, startDates))
      : [];

    // 4. Mapear datos
    const weeksWithData = weeks.map(w => {
      const saved = savedAssignments.find(s => s.startDate === w.startDate);
      return {
        startDate: w.startDate,
        endDate: w.endDate,
        label: w.label,
        supervisorName: saved?.supervisorName || DEFAULT_SUPERVISOR,
        referenteId: saved?.referenteId || null,
      };
    });

    // 5. Obtener lista de usuarios que pueden ser supervisores (admin, supervisor, team_leader)
    const supervisorsList = await db
      .select({ username: users.username })
      .from(users)
      .where(inArray(users.role, ["admin", "supervisor", "team_leader"]));

    const supervisors = supervisorsList.map(u => {
      return u.username
        .split(/[\s._-]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    });

    // Garantizar que el supervisor por defecto esté en la lista
    if (!supervisors.includes(DEFAULT_SUPERVISOR)) {
      supervisors.push(DEFAULT_SUPERVISOR);
    }

    return jsonResponse({ operatorId, weeks: weeksWithData, supervisors }, 200, "no-store, no-cache, must-revalidate");
  } catch (error: any) {
    console.error("GET Guardia Pasiva Error:", error);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = (await request.json()) as PostRequestBody;
    const { month, operatorId, weeklyAssignments } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return jsonResponse({ error: "Invalid month parameter" }, 400);
    }

    // Transacción síncrona con SQLite
    await db.transaction((tx) => {
      // 1. Actualizar o guardar Operador Mensual
      if (operatorId === null || operatorId === undefined || operatorId === "") {
        tx.delete(monthlyGuardiaPasivaOperator)
          .where(eq(monthlyGuardiaPasivaOperator.month, month))
          .run();
      } else {
        const opId = typeof operatorId === "string" ? parseInt(operatorId, 10) : operatorId;
        tx.insert(monthlyGuardiaPasivaOperator)
          .values({ month, operatorId: opId })
          .onConflictDoUpdate({
            target: monthlyGuardiaPasivaOperator.month,
            set: { operatorId: opId },
          })
          .run();
      }

      // 2. Actualizar, guardar o eliminar Asignaciones Semanales
      if (Array.isArray(weeklyAssignments)) {
        for (const item of weeklyAssignments) {
          const { startDate, endDate, supervisorName, referenteId } = item;
          if (!startDate) continue;

          // Si el referenteId no está asignado o es vacío, se borra el registro existente
          if (referenteId === null || referenteId === undefined || referenteId === "") {
            tx.delete(weeklyGuardiaPasivaAssignments)
              .where(eq(weeklyGuardiaPasivaAssignments.startDate, startDate))
              .run();
            continue;
          }

          const refId = typeof referenteId === "string" ? parseInt(referenteId, 10) : referenteId;

          // Si el referenteId está presente, se realiza un Upsert
          tx.insert(weeklyGuardiaPasivaAssignments)
            .values({
              startDate,
              endDate: endDate || "",
              supervisorName: supervisorName || DEFAULT_SUPERVISOR,
              referenteId: refId,
            })
            .onConflictDoUpdate({
              target: weeklyGuardiaPasivaAssignments.startDate,
              set: {
                endDate: endDate || "",
                supervisorName: supervisorName || DEFAULT_SUPERVISOR,
                referenteId: refId,
              },
            })
            .run();
        }
      }
    });

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Guardia Pasiva Error:", error);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  }
};
