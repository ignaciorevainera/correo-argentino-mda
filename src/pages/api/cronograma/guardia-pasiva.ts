import type { APIRoute } from "astro";
import { db } from "@db/index";
import {
  monthlyGuardiaPasivaOperator,
  weeklyGuardiaPasivaAssignments,
  users,
  employees,
  agents,
} from "@db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";

const DEFAULT_SUPERVISOR = "Tomasi Alejandro";

interface PostRequestBody {
  month?: string;
  weeklyAssignments?: Array<{
    startDate?: string;
    endDate?: string;
    supervisorName?: string;
    referenteId?: number | null | string;
    operatorId?: number | null | string;
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

    // 1. Obtener operador mensual (fallback)
    const opResult = await db
      .select()
      .from(monthlyGuardiaPasivaOperator)
      .where(eq(monthlyGuardiaPasivaOperator.month, month))
      .limit(1);
    const operatorId = opResult[0]?.operatorId || null;

    // 2. Calcular semanas del mes
    const weeks = getWeeksForMonth(month);

    // 3. Obtener asignaciones guardadas para estas semanas
    const startDates = weeks.map((w) => w.startDate);
    const savedAssignments =
      startDates.length > 0
        ? await db
            .select()
            .from(weeklyGuardiaPasivaAssignments)
            .where(
              inArray(weeklyGuardiaPasivaAssignments.startDate, startDates),
            )
        : [];

    // 4. Mapear datos
    const weeksWithData = weeks.map((w) => {
      const saved = savedAssignments.find((s) => s.startDate === w.startDate);
      let sName = saved?.supervisorName || DEFAULT_SUPERVISOR;
      if (sName === "Otomasi") sName = "Tomasi Alejandro";
      if (sName === "Farce") sName = "Arce Franco";
      return {
        startDate: w.startDate,
        endDate: w.endDate,
        label: w.label,
        supervisorName: sName,
        referenteId: saved?.referenteId || null,
        operatorId: saved?.operatorId || null,
      };
    });

    // 5. Obtener lista de usuarios que pueden ser supervisores con sus nombres completos
    const supervisorsList = await db
      .select({
        username: users.username,
        agentName: agents.name,
        empFullname: employees.fullname,
      })
      .from(users)
      .leftJoin(
        agents,
        sql`lower(${agents.username}) = lower(${users.username})`,
      )
      .leftJoin(
        employees,
        sql`lower(${employees.username}) = lower(${users.username})`,
      )
      .where(inArray(users.role, ["admin", "supervisor", "team_leader"]));

    const supervisorNamesSet = new Set<string>();
    supervisorNamesSet.add(DEFAULT_SUPERVISOR);

    supervisorsList.forEach((u) => {
      let name = u.agentName;
      if (!name && u.empFullname) {
        const parts = u.empFullname.trim().split(/\s+/);
        if (parts.length === 2) {
          name = `${parts[1]} ${parts[0]}`;
        } else if (parts.length >= 3) {
          name = `${parts[parts.length - 1]} ${parts[1]}`;
        } else {
          name = u.empFullname;
        }
      }
      if (u.username.toLowerCase() === "otomasi") {
        name = "Tomasi Alejandro";
      }
      if (name) {
        supervisorNamesSet.add(name);
      }
    });

    const supervisors = Array.from(supervisorNamesSet).sort((a, b) =>
      a.localeCompare(b),
    );

    // 6. Obtener lista de referentes (agentes con rol referent, supervisor, team_leader, admin)
    const referentesList = await db
      .select({
        id: agents.id,
        name: agents.name,
      })
      .from(agents)
      .innerJoin(
        users,
        sql`lower(${agents.username}) = lower(${users.username})`,
      )
      .where(
        inArray(users.role, ["referent", "supervisor", "team_leader", "admin"]),
      )
      .orderBy(agents.name);

    return jsonResponse(
      {
        operatorId,
        weeks: weeksWithData,
        supervisors,
        referentes: referentesList,
      },
      200,
      "no-store, no-cache, must-revalidate",
    );
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
    const { month, weeklyAssignments } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return jsonResponse({ error: "Invalid month parameter" }, 400);
    }

    // Transacción síncrona con SQLite
    await db.transaction((tx) => {
      // Actualizar, guardar o eliminar Asignaciones Semanales
      if (Array.isArray(weeklyAssignments)) {
        for (const item of weeklyAssignments) {
          const {
            startDate,
            endDate,
            supervisorName,
            referenteId,
            operatorId,
          } = item;
          if (!startDate) continue;

          const refId = referenteId
            ? typeof referenteId === "string"
              ? parseInt(referenteId, 10)
              : referenteId
            : null;
          const opId = operatorId
            ? typeof operatorId === "string"
              ? parseInt(operatorId, 10)
              : operatorId
            : null;

          if (
            !refId &&
            !opId &&
            (!supervisorName || supervisorName === DEFAULT_SUPERVISOR)
          ) {
            tx.delete(weeklyGuardiaPasivaAssignments)
              .where(eq(weeklyGuardiaPasivaAssignments.startDate, startDate))
              .run();
            continue;
          }

          tx.insert(weeklyGuardiaPasivaAssignments)
            .values({
              startDate,
              endDate: endDate || "",
              supervisorName: supervisorName || DEFAULT_SUPERVISOR,
              referenteId: refId,
              operatorId: opId,
            })
            .onConflictDoUpdate({
              target: weeklyGuardiaPasivaAssignments.startDate,
              set: {
                endDate: endDate || "",
                supervisorName: supervisorName || DEFAULT_SUPERVISOR,
                referenteId: refId,
                operatorId: opId,
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
