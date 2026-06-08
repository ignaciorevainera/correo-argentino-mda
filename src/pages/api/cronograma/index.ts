import type { APIRoute } from "astro";
import { db } from "@/db";
import { agents, schedules } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const GET: APIRoute = async () => {
  try {
    // 1. Fetch all agents (operators) from DB
    const dbAgents = await db.select().from(agents);

    const baseline = dbAgents.map((agent) => ({
      id: agent.id,
      nombre: agent.name,
      username: agent.username || undefined,
      horario: agent.horarioDefault,
      location: agent.location || "Monte Grande",
      asistencia: {},
      esquema_semanal: agent.esquemaSemanal || {},
      esquema_horario: agent.esquemaHorario || {},
      esquema_break_inicio: agent.esquemaBreakInicio || {},
      esquema_break_fin: agent.esquemaBreakFin || {},
      maxConsecutiveHO: agent.maxConsecutiveHO,
      minPWeek: agent.minPWeek,
    }));

    // 2. Fetch all persistent schedule overrides from DB
    const dbSchedules = await db.select().from(schedules);

    // 3. Merge database overrides into baseline structure
    const merged = baseline.map((operator: any) => {
      const name = operator.nombre;
      const opOverrides = dbSchedules.filter((s) => s.agentName === name);

      const newAsistencia = { ...operator.asistencia };
      const newComentarios: Record<string, string> = {};
      const newHorariosDias: Record<string, string> = {};
      const newEntradasReales: Record<string, string> = {};
      const newSalidasReales: Record<string, string> = {};
      const newBreaksInicio: Record<string, string> = {};
      const newBreaksFin: Record<string, string> = {};

      // Load specific DB overrides first
      opOverrides.forEach((s) => {
        if (s.status === "Franco" || s.status === "") {
          newAsistencia[s.date] = "Franco";
        } else {
          newAsistencia[s.date] = s.status;
        }
        if (s.comment) {
          newComentarios[s.date] = s.comment;
        }
        if (s.horario !== undefined && s.horario !== null) {
          newHorariosDias[s.date] = s.horario;
        }
        // Real entry/exit times are now handled by operator_attendance and ignored in Cronograma
        if (s.breakInicio) {
          newBreaksInicio[s.date] = s.breakInicio;
        }
        if (s.breakFin) {
          newBreaksFin[s.date] = s.breakFin;
        }
      });

      // Fill in default hours and breaks for any dates that exist in newAsistencia
      const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
      Object.keys(newAsistencia).forEach(dateStr => {
        const dateObj = new Date(dateStr + "T12:00:00");
        const dayName = dayNames[dateObj.getDay()];
        const status = newAsistencia[dateStr];

        if (newHorariosDias[dateStr] === undefined) {
          if (operator.esquema_horario?.[dayName]) {
            newHorariosDias[dateStr] = operator.esquema_horario[dayName];
          } else if (status !== "Franco") {
            newHorariosDias[dateStr] = operator.horario || "08:00 - 17:00";
          } else {
            newHorariosDias[dateStr] = "";
          }
        }

        if (newBreaksInicio[dateStr] === undefined) {
          if (operator.esquema_break_inicio?.[dayName]) {
            newBreaksInicio[dateStr] = operator.esquema_break_inicio[dayName];
          } else {
            newBreaksInicio[dateStr] = "";
          }
        }

        if (newBreaksFin[dateStr] === undefined) {
          if (operator.esquema_break_fin?.[dayName]) {
            newBreaksFin[dateStr] = operator.esquema_break_fin[dayName];
          } else {
            newBreaksFin[dateStr] = "";
          }
        }
      });

      return {
        ...operator,
        asistencia: newAsistencia,
        comentarios: newComentarios,
        horarios_dias: newHorariosDias,
        entradas_reales: newEntradasReales,
        salidas_reales: newSalidasReales,
        breaks_inicio: newBreaksInicio,
        breaks_fin: newBreaksFin,
      };
    });

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { edits, weeklySchedules } = body; // Array of { agentName, date, status, comment, horario } or weeklySchedules

    if (weeklySchedules && Array.isArray(weeklySchedules)) {
      for (const ws of weeklySchedules) {
        const { agentName, esquema_semanal, esquema_horario, esquema_break_inicio, esquema_break_fin } = ws;
        if (!agentName) continue;

        const updateData: any = {};
        if (esquema_semanal !== undefined) {
          updateData.esquemaSemanal = esquema_semanal;
        }
        if (esquema_horario !== undefined) {
          updateData.esquemaHorario = esquema_horario;
        }
        if (esquema_break_inicio !== undefined) {
          updateData.esquemaBreakInicio = esquema_break_inicio;
        }
        if (esquema_break_fin !== undefined) {
          updateData.esquemaBreakFin = esquema_break_fin;
        }

        if (Object.keys(updateData).length > 0) {
          await db
            .update(agents)
            .set(updateData)
            .where(eq(agents.name, agentName));
        }
      }

      if (!edits || !Array.isArray(edits)) {
        return new Response(JSON.stringify({ success: true, message: "Weekly schedules updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (!Array.isArray(edits)) {
      return new Response(JSON.stringify({ error: "Edits must be an array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process each edit
    for (const edit of edits) {
      const { agentName, date, status, comment, horario, entradaReal, salidaReal, breakInicio, breakFin } = edit;
      if (!agentName || !date) continue;

      const existing = await db
        .select()
        .from(schedules)
        .where(
          and(
            eq(schedules.agentName, agentName),
            eq(schedules.date, date)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const updateData: any = {};
        if (status !== undefined) updateData.status = status;
        if (comment !== undefined) updateData.comment = comment;
        if (horario !== undefined) updateData.horario = horario;
        if (breakInicio !== undefined) updateData.breakInicio = breakInicio;
        if (breakFin !== undefined) updateData.breakFin = breakFin;

        await db
          .update(schedules)
          .set(updateData)
          .where(eq(schedules.id, existing[0].id));
      } else {
        await db.insert(schedules).values({
          agentName,
          date,
          status: status !== undefined ? status : "Franco",
          comment: comment || "",
          horario: horario || "",
          breakInicio: breakInicio || "",
          breakFin: breakFin || "",
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
