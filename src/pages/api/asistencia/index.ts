import type { APIRoute } from "astro";
import { db } from "@/db";
import { agents, schedules, operatorAttendance } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// Helper to generate dates in range (inclusive, max 31 days)
function getDatesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startStr + "T12:00:00");
  const end = new Date(endStr + "T12:00:00");
  const current = new Date(start);
  
  // Enforce range limit of 31 days
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 31) {
    end.setTime(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Utility to parse time ranges like "08:00 - 17:00" or "08 a 17"
function parseTimeRange(range: string) {
  if (!range || range.trim() === "" || range.trim() === "-") return null;
  const clean = range.toLowerCase().replace(/\s+/g, "");
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?(?:-|a)(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const startH = parseInt(match[1]);
  const startM = match[2] ? parseInt(match[2]) : 0;
  const endH = parseInt(match[3]);
  const endM = match[4] ? parseInt(match[4]) : 0;
  return { startH, startM, endH, endM };
}

// Automatically calculate compliance
export function calculateCompliance(
  entradaReal: string | null | undefined,
  horarioEstipulado: string | null | undefined
): string {
  if (!entradaReal) return "Sin Registro";
  if (!horarioEstipulado) return "Cumplió";
  
  const times = parseTimeRange(horarioEstipulado);
  if (!times) return "Cumplió";
  
  let late = false;
  
  const [eh, em] = entradaReal.split(":").map(Number);
  if (!isNaN(eh) && !isNaN(em)) {
    const startMinutes = times.startH * 60 + times.startM;
    const realMinutes = eh * 60 + em;
    if (realMinutes > startMinutes + 10) {
      late = true;
    }
  }
  
  if (late) return "Llegada Tarde";
  return "Cumplió";
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const startDate = url.searchParams.get("startDate") || url.searchParams.get("date");

    if (!startDate) {
      return new Response(JSON.stringify({ error: "Missing date parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const endDate = url.searchParams.get("endDate") || startDate;
    const dates = getDatesInRange(startDate, endDate);

    // 1. Fetch all agents
    const dbAgents = await db.select().from(agents);

    // 2. Fetch schedules for this date range
    const dbSchedules = await db
      .select()
      .from(schedules)
      .where(and(
        gte(schedules.date, startDate),
        lte(schedules.date, endDate)
      ));

    // 3. Fetch attendance records for this date range
    const dbAttendance = await db
      .select()
      .from(operatorAttendance)
      .where(and(
        gte(operatorAttendance.date, startDate),
        lte(operatorAttendance.date, endDate)
      ));

    // Find scheduled months to know where to apply weekly defaults vs Franco
    const months = Array.from(new Set(dates.map(d => d.substring(0, 7))));
    const scheduledMonths: Record<string, boolean> = {};
    for (const m of months) {
      const existingSchedule = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(and(
          gte(schedules.date, `${m}-01`),
          lte(schedules.date, `${m}-31`)
        ))
        .limit(1);
      scheduledMonths[m] = existingSchedule.length > 0;
    }

    const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const responseData: any[] = [];

    for (const dateStr of dates) {
      const dateObj = new Date(dateStr + "T12:00:00");
      const dayName = dayNames[dateObj.getDay()];
      const monthStr = dateStr.substring(0, 7);
      const isScheduledMonth = !!scheduledMonths[monthStr];

      dbAgents.forEach((agent) => {
        // Find planned override for this date and agent
        const plan = dbSchedules.find((s) => s.agentName === agent.name && s.date === dateStr);
        
        let modalidadPlanificada = "Franco";
        let horarioEstipulado = "";

        if (isScheduledMonth) {
          // If the month is scheduled, we use schedules. If not present, agent is Franco
          if (plan) {
            modalidadPlanificada = plan.status;
            horarioEstipulado = plan.horario || "";
          } else {
            modalidadPlanificada = "Franco";
            horarioEstipulado = "";
          }
        } else {
          // If month is not scheduled, fall back to weekly defaults
          const esquemaSemanal = (agent.esquemaSemanal as Record<string, string>) || {};
          const esquemaHorario = (agent.esquemaHorario as Record<string, string>) || {};
          modalidadPlanificada = esquemaSemanal[dayName] ?? "Franco";
          horarioEstipulado = esquemaHorario[dayName] || "";
        }

        if (!modalidadPlanificada || modalidadPlanificada.trim() === "") {
          modalidadPlanificada = "Franco";
        }

        if (modalidadPlanificada === "Franco") {
          horarioEstipulado = "";
        } else if (!horarioEstipulado || horarioEstipulado.trim() === "" || horarioEstipulado.trim() === "-") {
          horarioEstipulado = agent.horarioDefault || "08:00 - 17:00";
        }

        // Find actual attendance record
        const actual = dbAttendance.find((a) => a.agentId === agent.id && a.date === dateStr);

        // Default attendance modal (Home Office -> HOME OFFICE, Presencial -> PRESENCIAL MONTE GRANDE or location)
        let defaultAsistencia = "";
        if (modalidadPlanificada === "Home Office") {
          defaultAsistencia = "HOME OFFICE";
        } else if (modalidadPlanificada === "Presencial") {
          defaultAsistencia = agent.location ? `PRESENCIAL ${agent.location.toUpperCase()}` : "PRESENCIAL MONTE GRANDE";
        }

        const asistencia = actual?.asistencia ?? defaultAsistencia;
        const ausencia = actual?.ausencia ?? "";
        const entradaReal = actual?.entradaReal ?? "";
        const cumplimientoForzado = actual?.cumplimientoForzado ?? false;
        const motivoLoguin = actual?.motivoLoguin ?? "";
        const detalle = actual?.detalle ?? "";

        // Calculate compliance
        let cumplimiento = actual?.cumplimiento ?? "";
        if (!cumplimientoForzado || !cumplimiento) {
          cumplimiento = calculateCompliance(entradaReal, horarioEstipulado);
        }

        responseData.push({
          agentId: agent.id,
          date: dateStr,
          nombre: agent.name,
          username: agent.username || "",
          location: agent.location || "Monte Grande",
          horarioEstipulado,
          modalidadPlanificada,
          asistenciaId: actual?.id || null,
          asistencia,
          ausencia,
          entradaReal,
          cumplimiento,
          cumplimientoForzado,
          motivoLoguin,
          detalle,
        });
      });
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Attendance API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { date, edits } = body;

    if (!Array.isArray(edits)) {
      return new Response(JSON.stringify({ error: "Missing edits array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Date validation setup
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const currentYear = parseInt(todayStr.split("-")[0]);

    // 1. First validate all edits to ensure atomic integrity
    for (const edit of edits) {
      const editDate = edit.date || date;
      
      if (!editDate) {
        return new Response(JSON.stringify({ error: "Falta la fecha de registro" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Format check (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
        return new Response(JSON.stringify({ error: `Formato de fecha inválido: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Real calendar date check
      const dateParts = editDate.split("-").map(Number);
      const parsedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      if (
        parsedDate.getFullYear() !== dateParts[0] ||
        parsedDate.getMonth() !== dateParts[1] - 1 ||
        parsedDate.getDate() !== dateParts[2]
      ) {
        return new Response(JSON.stringify({ error: `Fecha inexistente en el calendario: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Future date block
      if (editDate > todayStr) {
        return new Response(JSON.stringify({ error: `No se permite registrar asistencia para fechas futuras: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Closed year check
      if (dateParts[0] !== currentYear) {
        return new Response(JSON.stringify({ error: `El registro histórico para el año ${dateParts[0]} está cerrado: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2. Perform updates
    for (const edit of edits) {
      const {
        agentId,
        asistencia,
        ausencia,
        entradaReal,
        cumplimiento,
        cumplimientoForzado,
        motivoLoguin,
        detalle,
      } = edit;

      const editDate = edit.date || date;
      if (!agentId) continue;

      const existing = await db
        .select()
        .from(operatorAttendance)
        .where(
          and(
            eq(operatorAttendance.agentId, agentId),
            eq(operatorAttendance.date, editDate)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const updateData: any = {};
        if (asistencia !== undefined) updateData.asistencia = asistencia;
        if (ausencia !== undefined) updateData.ausencia = ausencia;
        if (entradaReal !== undefined) updateData.entradaReal = entradaReal;
        if (cumplimiento !== undefined) updateData.cumplimiento = cumplimiento;
        if (cumplimientoForzado !== undefined) updateData.cumplimientoForzado = !!cumplimientoForzado;
        if (motivoLoguin !== undefined) updateData.motivoLoguin = motivoLoguin;
        if (detalle !== undefined) updateData.detalle = detalle;

        if (Object.keys(updateData).length > 0) {
          await db
            .update(operatorAttendance)
            .set(updateData)
            .where(eq(operatorAttendance.id, existing[0].id));
        }
      } else {
        await db.insert(operatorAttendance).values({
          agentId,
          date: editDate,
          asistencia: asistencia || "",
          ausencia: ausencia || "",
          entradaReal: entradaReal || "",
          cumplimiento: cumplimiento || "",
          cumplimientoForzado: !!cumplimientoForzado,
          motivoLoguin: motivoLoguin || "",
          detalle: detalle || "",
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST Attendance API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
