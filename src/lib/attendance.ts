import { db } from "@db/index";
import {
  agents,
  schedules,
  operatorAttendance,
  saturdayRotationConfig,
  agentSaturdayGroups,
} from "@db/schema";
import { and, gte, lte, inArray, sql, lt, desc } from "drizzle-orm";

// Helper to generate dates in range (inclusive, max 31 days)
export function getDatesInRange(startStr: string, endStr: string): string[] {
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
export function parseTimeRange(range: string) {
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

export async function getAttendanceData(startDate: string, endDate: string) {
  const dates = getDatesInRange(startDate, endDate);

  // 1. Fetch all agents
  const dbAgents = await db.select({
    id: agents.id, name: agents.name, username: agents.username, location: agents.location,
    horarioDefault: agents.horarioDefault,
    esquemaSemanal: agents.esquemaSemanal, esquemaHorario: agents.esquemaHorario,
    saturdayGroup: agents.saturdayGroup, saturdayHorario: agents.saturdayHorario,
  }).from(agents);

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
    scheduledMonths[m] = false;
  }

  if (months.length > 0) {
    const dbScheduled = await db
      .select({
        month: sql<string>`substr(${schedules.date}, 1, 7)`
      })
      .from(schedules)
      .where(
        inArray(
          sql<string>`substr(${schedules.date}, 1, 7)`,
          months
        )
      )
      .groupBy(sql`substr(${schedules.date}, 1, 7)`);

    for (const row of dbScheduled) {
      if (row.month) {
        scheduledMonths[row.month] = true;
      }
    }
  }

  // Load Saturday rotation configs for these months
  const dbRotationConfigs = months.length > 0 ? await db
    .select()
    .from(saturdayRotationConfig)
    .where(inArray(saturdayRotationConfig.month, months)) : [];

  const rotationConfigsByMonth: Record<string, typeof saturdayRotationConfig.$inferSelect> = {};
  for (const m of months) {
    let config = dbRotationConfigs.find(c => c.month === m);
    if (!config) {
      // Fallback: try to find the closest previous one
      const previousConfigs = await db
        .select()
        .from(saturdayRotationConfig)
        .where(lt(saturdayRotationConfig.month, m))
        .orderBy(desc(saturdayRotationConfig.month))
        .limit(1);
      const baseConfig = previousConfigs[0] || {
        id: 0,
        month: m,
        rotationOrder: "A,B,C,D",
        startDate: "2026-06-06",
        startGroup: "A",
      };
      config = {
        id: baseConfig.id,
        month: m,
        rotationOrder: baseConfig.rotationOrder,
        startDate: baseConfig.startDate,
        startGroup: baseConfig.startGroup,
      };
    }
    rotationConfigsByMonth[m] = config;
  }

  // Pre-calculate resolved Saturday config for each agent for each month in the range
  const maxMonth = months.reduce((max, m) => m > max ? m : max, "");
  const allDbAgentSaturdayGroups = months.length > 0 ? await db
    .select()
    .from(agentSaturdayGroups)
    .where(lte(agentSaturdayGroups.month, maxMonth))
    .orderBy(agentSaturdayGroups.month)
    : [];

  const resolvedAgentSaturdayConfig: Record<string, { group: string | null; horarioSat: string | null }> = {};

  for (const agent of dbAgents) {
    let currentGroup = agent.saturdayGroup || null;
    let currentHorario = agent.saturdayHorario || null;

    const agentOverrides = allDbAgentSaturdayGroups
      .filter(g => g.agentId === agent.id)
      .sort((a, b) => a.month.localeCompare(b.month));

    for (const m of months) {
      const configForMonth = agentOverrides.find(o => o.month === m);
      if (configForMonth) {
        currentGroup = configForMonth.saturdayGroup || null;
        currentHorario = configForMonth.saturdayHorario || null;
      } else {
        const prevConfigs = agentOverrides.filter(o => o.month < m);
        if (prevConfigs.length > 0) {
          const closest = prevConfigs[prevConfigs.length - 1];
          currentGroup = closest.saturdayGroup || null;
          currentHorario = closest.saturdayHorario || null;
        }
      }
      resolvedAgentSaturdayConfig[`${agent.id}_${m}`] = {
        group: currentGroup,
        horarioSat: currentHorario
      };
    }
  }

  const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const responseData: any[] = [];

  for (const dateStr of dates) {
    const dateObj = new Date(dateStr + "T12:00:00");
    const dayName = dayNames[dateObj.getDay()];
    const isSaturday = dateObj.getDay() === 6;
    const monthStr = dateStr.substring(0, 7);
    const isScheduledMonth = !!scheduledMonths[monthStr];

    dbAgents.forEach((agent) => {
      // Find planned override/schedule for this date and agent
      const plan = dbSchedules.find((s) => s.agentName === agent.name && s.date === dateStr);
      
      let isSaturdayRotationShift = false;
      let rotationHorario = "";

      if (isSaturday) {
        const satConfig = resolvedAgentSaturdayConfig[`${agent.id}_${monthStr}`];
        const satGroup = satConfig?.group;
        
        if (satGroup) {
          const rotConfig = rotationConfigsByMonth[monthStr];
          if (rotConfig) {
            const start = new Date(rotConfig.startDate + "T12:00:00");
            const diffDays = Math.round((dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            const weeksDiff = Math.floor(diffDays / 7);
            const groups = rotConfig.rotationOrder.split(",").map((g) => g.trim());
            const N = groups.length;
            const startIndex = groups.indexOf(rotConfig.startGroup);
            const idx = startIndex >= 0 ? startIndex : 0;
            const activeIndex = ((idx + weeksDiff) % N + N) % N;
            const activeGroup = groups[activeIndex];

            if (satGroup === activeGroup) {
              isSaturdayRotationShift = true;
              rotationHorario = satConfig.horarioSat || "07:00 - 13:00";
            }
          }
        }
      }

      let modalidadPlanificada = "Franco";
      let horarioEstipulado = "";

      if (isScheduledMonth) {
        if (plan) {
          if (isSaturday) {
            if (plan.isOverride) {
              modalidadPlanificada = plan.status;
              horarioEstipulado = plan.horario || "";
            } else if (isSaturdayRotationShift) {
              modalidadPlanificada = "Home Office";
              horarioEstipulado = rotationHorario;
            } else {
              modalidadPlanificada = "Franco";
              horarioEstipulado = "";
            }
          } else {
            modalidadPlanificada = plan.status;
            horarioEstipulado = plan.horario || "";
          }
        } else {
          if (isSaturday && isSaturdayRotationShift) {
            modalidadPlanificada = "Home Office";
            horarioEstipulado = rotationHorario;
          } else {
            modalidadPlanificada = "Franco";
            horarioEstipulado = "";
          }
        }
      } else {
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
        horarioEstipulado = agent.horarioDefault || "";
      }

      // Find actual attendance record
      const actual = dbAttendance.find((a) => a.agentId === agent.id && a.date === dateStr);

      let defaultAsistencia = "";
      if (modalidadPlanificada === "Home Office") {
        defaultAsistencia = "HOME OFFICE";
      } else if (modalidadPlanificada?.startsWith("Presencial")) {
        defaultAsistencia = modalidadPlanificada.toUpperCase();
      }

      const asistencia = actual?.asistencia || defaultAsistencia;
      const ausencia = actual?.ausencia ?? "";
      const entradaReal = actual?.entradaReal ?? "";
      const cumplimientoForzado = actual?.cumplimientoForzado ?? false;
      const motivoLoguin = actual?.motivoLoguin ?? "";
      const detalle = actual?.detalle ?? "";

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

  return responseData;
}
