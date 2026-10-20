import { db } from "@db/index";
import {
  agents,
  schedules,
  saturdayRotationConfig,
  weekendOvertimeConfig,
  weekendOvertimeShifts,
  agentSaturdayGroups,
  users,
} from "@db/schema";
import { eq, desc, lt, like, lte, sql } from "drizzle-orm";
import { activeCronogramaAgentCondition } from "@lib/activeUsers";
import { resolveInitialMonth } from "@components/cronograma/lib/initialMonth";
import { currentMonthYM } from "@components/cronograma/lib/monthLabel";

export type CronogramaPayload = {
  operators: any[];
  weekendOvertimeConfigs: (typeof weekendOvertimeConfig.$inferSelect)[];
  availableMonths: string[];
  activeMonth: string;
};

/** Índice O(1) por agente; ignora filas sin agentId. */
export function groupByAgentId<T extends { agentId: number | null }>(
  rows: T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    if (row.agentId == null) continue;
    const bucket = map.get(row.agentId);
    if (bucket) bucket.push(row);
    else map.set(row.agentId, [row]);
  }
  return map;
}

/** Deriva los mapas de grupo del mes activo y del mes anterior más cercano. */
export function deriveGroupMaps<
  T extends {
    agentId: number;
    month: string;
    saturdayGroup: string | null;
    saturdayHorario: string | null;
  },
>(
  rows: T[],
  activeMonth: string,
): { monthly: Map<number, T>; previous: Map<number, T> } {
  const monthly = new Map<number, T>();
  let prevMonth: string | undefined;
  for (const row of rows) {
    if (row.month === activeMonth && !monthly.has(row.agentId)) {
      monthly.set(row.agentId, row);
    }
    if (
      row.month < activeMonth &&
      (prevMonth === undefined || row.month > prevMonth)
    ) {
      prevMonth = row.month;
    }
  }

  const previous = new Map<number, T>();
  if (prevMonth !== undefined) {
    for (const row of rows) {
      if (row.month === prevMonth && !previous.has(row.agentId)) {
        previous.set(row.agentId, row);
      }
    }
  }
  return { monthly, previous };
}

export async function listAvailableMonths(): Promise<string[]> {
  const dbSchedulesList = await db
    .select({ month: sql<string>`distinct substr(${schedules.date}, 1, 7)` })
    .from(schedules);
  const dbRotationList = await db
    .select({ month: saturdayRotationConfig.month })
    .from(saturdayRotationConfig);

  const months = new Set<string>();
  for (const row of dbSchedulesList) {
    if (row.month) months.add(row.month);
  }
  for (const row of dbRotationList) {
    if (row.month) months.add(row.month);
  }
  return [...months].sort();
}

/** Resuelve el mes activo (misma regla que hoy: `?month=` → mes local actual → más cercano hacia atrás). */
export function resolveCronogramaMonth(
  requested: string | null,
  availableMonths: string[],
): string {
  return (
    requested || resolveInitialMonth(availableMonths, currentMonthYM(new Date()))
  );
}

/** Payload completo del mes activo. */
export async function buildCronogramaPayload(
  activeMonth: string,
  availableMonths: string[],
): Promise<CronogramaPayload> {
  // Cargar configuración de rotación para este mes
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
      disabledGroups: "",
    };

    // Devolver configuración en memoria sin persistirla en GET (Side-effect free GET)
    rotationConfig = {
      id: 0,
      month: activeMonth,
      rotationOrder: baseConfig.rotationOrder,
      startDate: baseConfig.startDate,
      startGroup: baseConfig.startGroup,
      disabledGroups: baseConfig.disabledGroups || "",
    };
  }

  // Cargar asignaciones de grupos de sábados: la consulta única trae todos los
  // meses <= activeMonth ordenados desc; el mes actual y el anterior se derivan
  // en JS preservando la semántica previa (ver deriveGroupMaps).
  const dbSaturdayGroups = await db
    .select()
    .from(agentSaturdayGroups)
    .where(lte(agentSaturdayGroups.month, activeMonth))
    .orderBy(desc(agentSaturdayGroups.month));

  const { monthly: monthlyGroupsMap, previous: previousGroupsMap } =
    deriveGroupMaps(dbSaturdayGroups, activeMonth);

  // Cargar todos los agentes
  const dbAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      username: agents.username,
      location: agents.location,
      horarioDefault: agents.horarioDefault,
      esquemaSemanal: agents.esquemaSemanal,
      esquemaHorario: agents.esquemaHorario,
      esquemaBreakInicio: agents.esquemaBreakInicio,
      esquemaBreakFin: agents.esquemaBreakFin,
      maxConsecutiveHO: agents.maxConsecutiveHO,
      minPWeek: agents.minPWeek,
      saturdayGroup: agents.saturdayGroup,
      saturdayHorario: agents.saturdayHorario,
      enCronograma: agents.enCronograma,
    })
    .from(agents)
    .leftJoin(users, eq(users.id, agents.userId))
    .where(activeCronogramaAgentCondition());

  // Cargar horas extras de fin de semana para este mes (Scope Overtime Configuration by Month)
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

  // Buscar horarios específicos del mes de schedules de la base de datos
  const dbSchedules = await db
    .select()
    .from(schedules)
    .where(like(schedules.date, `${activeMonth}-%`));

  const schedulesByAgent = groupByAgentId(dbSchedules);
  const overtimeByAgent = groupByAgentId(dbOvertimeShifts);

  // Combinar schedules sobre la base
  const merged = baseline.map((operator: any) => {
    // Vinculo exclusivo por id (Plan B2): schedules.agent_name ya no existe.
    const opOverrides = schedulesByAgent.get(operator.id) ?? [];

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

      const dateObj = new Date(s.date + "T12:00:00");
      const isWeekendDay = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      if (s.isOverride) {
        if (isWeekendDay) {
          if (status === "Vacaciones" || status === "Licencia") {
            overrides[s.date] = true;
          }
        } else {
          overrides[s.date] = true;
        }
      }

      // Cálculo dinámico de sábados de rotación
      const isSaturday = dateObj.getDay() === 6;
      if (isSaturday && operator.saturdayGroup) {
        const disabledList = (rotationConfig.disabledGroups || "")
          .split(",")
          .map((g: string) => g.trim())
          .filter(Boolean);
        if (!disabledList.includes(operator.saturdayGroup)) {
          const start = new Date(rotationConfig.startDate + "T12:00:00");
          const diffDays = Math.round(
            (dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
          );
          const weeksDiff = Math.floor(diffDays / 7);
          const groups = rotationConfig.rotationOrder
            .split(",")
            .map((g) => g.trim());
          const N = groups.length;
          const startIndex = groups.indexOf(rotationConfig.startGroup);
          const idx = startIndex >= 0 ? startIndex : 0;
          const activeIndex = (((idx + weeksDiff) % N) + N) % N;
          const activeGroup = groups[activeIndex];

          if (operator.saturdayGroup === activeGroup && !overrides[s.date]) {
            status = "Home Office";
            horario = operator.saturdayHorario || "07:00 - 13:00";
          }
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
    const dayNames = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miercoles",
      "Jueves",
      "Viernes",
      "Sabado",
    ];
    Object.keys(newAsistencia).forEach((dateStr) => {
      const dateObj = new Date(dateStr + "T12:00:00");
      const dayName = dayNames[dateObj.getDay()];
      const status = newAsistencia[dateStr];

      if (newHorariosDias[dateStr] === undefined) {
        if (operator.esquema_horario?.[dayName]) {
          newHorariosDias[dateStr] = operator.esquema_horario[dayName];
        } else if (status !== "Franco") {
          newHorariosDias[dateStr] = operator.horario || "";
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

    const agentOvertimes = (overtimeByAgent.get(operator.id) ?? []).map(
      (s) => ({
        id: s.id,
        weekendStartDate: s.weekendStartDate,
        agentId: s.agentId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      }),
    );

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

  return {
    operators: merged,
    weekendOvertimeConfigs: dbOvertimeConfigs,
    availableMonths,
    activeMonth,
  };
}
