import type { APIRoute } from "astro";
import { db } from "@/db";
import { monthlyGuardiaPasivaOperator, weeklyGuardiaPasivaAssignments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

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
      return new Response(JSON.stringify({ error: "Missing or invalid month parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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

    return new Response(JSON.stringify({ operatorId, weeks: weeksWithData }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Guardia Pasiva Error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as PostRequestBody;
    const { month, operatorId, weeklyAssignments } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return new Response(JSON.stringify({ error: "Invalid month parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Calcular y validar las semanas del mes
    const validWeeks = getWeeksForMonth(month);
    const validWeekMap = new Map(validWeeks.map(w => [w.startDate, w.endDate]));

    // 2. Validar operatorId si se proporciona
    let opId: number | null = null;
    if (operatorId !== undefined && operatorId !== null && operatorId !== "") {
      opId = typeof operatorId === "string" ? parseInt(operatorId, 10) : operatorId;
      if (isNaN(opId) || opId <= 0) {
        return new Response(JSON.stringify({ error: "Invalid operatorId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 3. Validar asignaciones semanales antes de iniciar la transacción
    const assignmentsToProcess: Array<{ startDate: string; endDate: string; supervisorName: string; referenteId: number | null }> = [];
    if (Array.isArray(weeklyAssignments)) {
      for (const item of weeklyAssignments) {
        const { startDate, supervisorName, referenteId } = item;
        if (!startDate) continue;

        // Asegurarse de que startDate corresponda a las semanas calculadas de este mes
        const expectedEndDate = validWeekMap.get(startDate);
        if (!expectedEndDate) {
          return new Response(JSON.stringify({ error: `La fecha de inicio ${startDate} no pertenece al mes ${month}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        let refId: number | null = null;
        if (referenteId !== null && referenteId !== undefined && referenteId !== "") {
          refId = typeof referenteId === "string" ? parseInt(referenteId, 10) : referenteId;
          if (isNaN(refId) || refId <= 0) {
            return new Response(JSON.stringify({ error: `Invalid referenteId for startDate ${startDate}` }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        assignmentsToProcess.push({
          startDate,
          endDate: expectedEndDate, // Rellenar desde el helper para evitar cadenas vacías en BD
          supervisorName: supervisorName || DEFAULT_SUPERVISOR,
          referenteId: refId
        });
      }
    }

    // 4. Realizar la transacción sincrónica en SQLite
    db.transaction((tx) => {
      // Solo actualiza el operador mensual si fue proporcionado explícitamente en el cuerpo del request
      if (operatorId !== undefined) {
        if (opId === null) {
          tx.delete(monthlyGuardiaPasivaOperator)
            .where(eq(monthlyGuardiaPasivaOperator.month, month))
            .run();
        } else {
          tx.insert(monthlyGuardiaPasivaOperator)
            .values({ month, operatorId: opId })
            .onConflictDoUpdate({
              target: monthlyGuardiaPasivaOperator.month,
              set: { operatorId: opId },
            })
            .run();
        }
      }

      // Actualizar asignaciones semanales
      if (weeklyAssignments !== undefined) {
        for (const assignment of assignmentsToProcess) {
          const { startDate, endDate, supervisorName, referenteId } = assignment;

          if (referenteId === null) {
            tx.delete(weeklyGuardiaPasivaAssignments)
              .where(eq(weeklyGuardiaPasivaAssignments.startDate, startDate))
              .run();
          } else {
            tx.insert(weeklyGuardiaPasivaAssignments)
              .values({
                startDate,
                endDate,
                supervisorName,
                referenteId,
              })
              .onConflictDoUpdate({
                target: weeklyGuardiaPasivaAssignments.startDate,
                set: {
                  endDate,
                  supervisorName,
                  referenteId,
                },
              })
              .run();
          }
        }
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("POST Guardia Pasiva Error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
