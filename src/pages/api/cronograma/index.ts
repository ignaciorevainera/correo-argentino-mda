import type { APIRoute } from "astro";
import { db } from "@/db";
import {
  agents,
  schedules,
  saturdayRotationConfig,
  weekendOvertimeConfig,
  weekendOvertimeShifts,
  agentSaturdayGroups,
} from "@/db/schema";
import { eq, and, desc, lt, like, sql } from "drizzle-orm";

export const GET: APIRoute = async ({ url }) => {
  try {
    // 1. Determinar el mes activo y meses disponibles (Database-Side Unique Months Aggregation)
    const dbSchedulesList = await db
      .select({ month: sql<string>`distinct substr(${schedules.date}, 1, 7)` })
      .from(schedules);
    const availableMonths = dbSchedulesList.map(s => s.month).filter(Boolean).sort();
    
    const d = new Date();
    const currentMonthDefault = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const activeMonth = url.searchParams.get("month") || (availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : currentMonthDefault);

    // 2. Cargar configuración de rotación para este mes
    let configList = await db
      .select()
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, activeMonth))
      .limit(1);
    let rotationConfig = configList[0];
    
    if (!rotationConfig) {
      // Fallback: intentar copiar el anterior más cercano
      const previousConfigs = await db
        .select()
        .from(saturdayRotationConfig)
        .where(lt(saturdayRotationConfig.month, activeMonth))
        .orderBy(desc(saturdayRotationConfig.month))
        .limit(1);
      
      const baseConfig = previousConfigs[0] || {
        rotationOrder: "A,B,C,D",
        startDate: "2026-06-06",
        startGroup: "A",
      };

      await db
        .insert(saturdayRotationConfig)
        .values({
          month: activeMonth,
          rotationOrder: baseConfig.rotationOrder,
          startDate: baseConfig.startDate,
          startGroup: baseConfig.startGroup,
        })
        .onConflictDoNothing();

      configList = await db
        .select()
        .from(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, activeMonth))
        .limit(1);
      rotationConfig = configList[0];
    }

    // 3. Cargar asignaciones de grupos de sábados específicas de este mes
    const dbMonthlyGroups = await db
      .select()
      .from(agentSaturdayGroups)
      .where(eq(agentSaturdayGroups.month, activeMonth));
    const monthlyGroupsMap = new Map(dbMonthlyGroups.map(g => [g.agentId, g]));

    // 4. Buscar asignaciones del mes anterior en caso de fallback (Optimized Fallback Group Lookup)
    const prevMonthResult = await db
      .select({ month: agentSaturdayGroups.month })
      .from(agentSaturdayGroups)
      .where(lt(agentSaturdayGroups.month, activeMonth))
      .orderBy(desc(agentSaturdayGroups.month))
      .limit(1);
    
    const prevMonth = prevMonthResult[0]?.month;
    let dbPreviousMonthlyGroups: typeof agentSaturdayGroups.$inferSelect[] = [];
    if (prevMonth) {
      dbPreviousMonthlyGroups = await db
        .select()
        .from(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.month, prevMonth));
    }
    
    const previousGroupsMap = new Map<number, typeof agentSaturdayGroups.$inferSelect>();
    for (const pg of dbPreviousMonthlyGroups) {
      if (!previousGroupsMap.has(pg.agentId)) {
        previousGroupsMap.set(pg.agentId, pg);
      }
    }

    // 5. Cargar todos los agentes
    const dbAgents = await db.select().from(agents);

    // 6. Cargar horas extras de fin de semana para este mes (Scope Overtime Configuration by Month)
    const dbOvertimeConfigs = await db
      .select()
      .from(weekendOvertimeConfig)
      .where(like(weekendOvertimeConfig.weekendStartDate, `${activeMonth}-%`));
    
    const dbOvertimeShifts = await db
      .select()
      .from(weekendOvertimeShifts)
      .where(like(weekendOvertimeShifts.weekendStartDate, `${activeMonth}-%`));

    const baseline = dbAgents.map((agent) => {
      // Resolver el grupo y horario de sábado para este mes
      let group = agent.saturdayGroup || undefined;
      let horarioSat = agent.saturdayHorario || undefined;

      // Comprobar si hay asignación específica para este mes
      const monthlyConfig = monthlyGroupsMap.get(agent.id);
      if (monthlyConfig) {
        group = monthlyConfig.saturdayGroup || undefined;
        horarioSat = monthlyConfig.saturdayHorario || undefined;
      } else {
        // Si no, comprobar si hay asignación histórica previa para copiarla a este mes
        const prevConfig = previousGroupsMap.get(agent.id);
        if (prevConfig) {
          group = prevConfig.saturdayGroup || undefined;
          horarioSat = prevConfig.saturdayHorario || undefined;
        }
      }

      return {
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
        saturdayGroup: group,
        saturdayHorario: horarioSat,
      };
    });

    // 7. Buscar horarios específicos del mes de schedules de la base de datos
    const dbSchedules = await db
      .select()
      .from(schedules)
      .where(like(schedules.date, `${activeMonth}-%`));

    // 8. Combinar schedules sobre la base
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
      const overrides: Record<string, boolean> = {};

      opOverrides.forEach((s) => {
        let status = s.status;
        let horario = s.horario;

        if (s.isOverride) {
          overrides[s.date] = true;
        }

        // Cálculo dinámico de sábados de rotación
        const dateObj = new Date(s.date + "T12:00:00");
        const isSaturday = dateObj.getDay() === 6;
        if (isSaturday && operator.saturdayGroup) {
          const start = new Date(rotationConfig.startDate + "T12:00:00");
          const diffDays = Math.round((dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          const weeksDiff = Math.floor(diffDays / 7);
          const groups = rotationConfig.rotationOrder.split(",").map((g) => g.trim());
          const N = groups.length;
          const startIndex = groups.indexOf(rotationConfig.startGroup);
          const idx = startIndex >= 0 ? startIndex : 0;
          const activeIndex = ((idx + weeksDiff) % N + N) % N;
          const activeGroup = groups[activeIndex];

          if (operator.saturdayGroup === activeGroup && !s.isOverride) {
            status = "Home Office";
            horario = operator.saturdayHorario || "07:00 - 13:00";
          }
        }

        if (status === "Franco" || status === "") {
          newAsistencia[s.date] = "Franco";
        } else {
          newAsistencia[s.date] = status;
        }
        if (s.comment) {
          newComentarios[s.date] = s.comment;
        }
        if (horario !== undefined && horario !== null) {
          newHorariosDias[s.date] = horario;
        }
        if (s.breakInicio) {
          newBreaksInicio[s.date] = s.breakInicio;
        }
        if (s.breakFin) {
          newBreaksFin[s.date] = s.breakFin;
        }
      });

      // Completar días vacíos con defaults semanales
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

      const agentOvertimes = operator.id
        ? dbOvertimeShifts
            .filter((s) => s.agentId === operator.id)
            .map((s) => ({
              id: s.id,
              weekendStartDate: s.weekendStartDate,
              agentId: s.agentId,
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
            }))
        : [];

      return {
        ...operator,
        asistencia: newAsistencia,
        comentarios: newComentarios,
        horarios_dias: newHorariosDias,
        entradas_reales: newEntradasReales,
        salidas_reales: newSalidasReales,
        breaks_inicio: newBreaksInicio,
        breaks_fin: newBreaksFin,
        overrides,
        weekendOvertimes: agentOvertimes,
      };
    });

    const responsePayload = {
      operators: merged,
      weekendOvertimeConfigs: dbOvertimeConfigs,
      availableMonths,
      activeMonth,
    };

    return new Response(JSON.stringify(responsePayload), {
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

    // Process each edit atomically inside a transaction (Transactions for Batch Edits)
    await db.transaction(async (tx) => {
      for (const edit of edits) {
        const { agentName, date, status, comment, horario, breakInicio, breakFin } = edit;
        if (!agentName || !date) continue;

        const existing = await tx
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
          updateData.isOverride = true;

          await tx
            .update(schedules)
            .set(updateData)
            .where(eq(schedules.id, existing[0].id));
        } else {
          await tx.insert(schedules).values({
            agentName,
            date,
            status: status !== undefined ? status : "Franco",
            comment: comment || "",
            horario: horario || "",
            breakInicio: breakInicio || "",
            breakFin: breakFin || "",
            isOverride: true,
          });
        }
      }
    });

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
