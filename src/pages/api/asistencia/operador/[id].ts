import type { APIRoute } from "astro";
import { db } from "@db/index";
import {
  agents,
  operatorAttendance,
  schedules,
  weekendOvertimeShifts,
  saturdayRotationConfig,
  agentSaturdayGroups,
} from "@db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireReadAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ params, url, locals }) => {
  const denied = requireReadAccess(locals, "asistencia");
  if (denied) return denied;

  try {
    const agentId = parseInt(params.id || "");
    if (isNaN(agentId)) {
      return jsonResponse({ error: "ID de operador inválido" }, 400);
    }

    // 1. Obtener datos del operador
    const agent = await db
      .select({
        id: agents.id,
        name: agents.name,
        username: agents.username,
        location: agents.location,
        avatarInitials: agents.avatarInitials,
        horarioDefault: agents.horarioDefault,
        saturdayGroup: agents.saturdayGroup,
        saturdayHorario: agents.saturdayHorario,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1)
      .then((res) => res[0]);

    if (!agent) {
      return jsonResponse({ error: "Operador no encontrado" }, 404);
    }

    // 2. Resolver filtros de rango de fechas
    const currentYear = new Date().getFullYear();
    const yearParam = url.searchParams.get("year");
    let year = yearParam ? parseInt(yearParam) : currentYear;
    if (isNaN(year) || year < 2020 || year > currentYear + 1) {
      year = currentYear;
    }
    const month = url.searchParams.get("month") || "all"; // "all" o "01".."12"
    const statusFilter = url.searchParams.get("status") || "all";

    let startDate = `${year}-01-01`;
    let endDate = `${year}-12-31`;
    if (month !== "all") {
      const monthNum = parseInt(month);
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    }

    // 3. Consulta indexada a base de datos de asistencias, cronograma, horas extras y rotación de sábados
    const [logs, schedList, overtimeList, rotConfigsList, satGroupsList] = await Promise.all([
      db
        .select()
        .from(operatorAttendance)
        .where(
          and(
            eq(operatorAttendance.agentId, agentId),
            gte(operatorAttendance.date, startDate),
            lte(operatorAttendance.date, endDate),
          ),
        )
        .orderBy(desc(operatorAttendance.date)),
      db
        .select({
          date: schedules.date,
          status: schedules.status,
          horario: schedules.horario,
        })
        .from(schedules)
        .where(
          and(
            eq(schedules.agentName, agent.name),
            gte(schedules.date, startDate),
            lte(schedules.date, endDate),
          ),
        ),
      db
        .select()
        .from(weekendOvertimeShifts)
        .where(
          and(
            eq(weekendOvertimeShifts.agentId, agentId),
            gte(weekendOvertimeShifts.date, startDate),
            lte(weekendOvertimeShifts.date, endDate),
          ),
        ),
      db.select().from(saturdayRotationConfig),
      db
        .select()
        .from(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.agentId, agentId)),
    ]);

    const schedByDate = new Map(schedList.map((s) => [s.date, s]));
    const otByDate = new Map(
      overtimeList.map((ot) => [ot.date, `${ot.startTime} - ${ot.endTime}`]),
    );

    function resolveSaturdayHorario(dateStr: string): string | null {
      const monthStr = dateStr.substring(0, 7);
      const overrides = satGroupsList
        .filter((g) => g.agentId === agentId)
        .sort((a, b) => a.month.localeCompare(b.month));

      let currentGroup = agent.saturdayGroup || null;
      let currentHorario = agent.saturdayHorario || null;

      const configForMonth = overrides.find((o) => o.month === monthStr);
      if (configForMonth) {
        currentGroup = configForMonth.saturdayGroup || null;
        currentHorario = configForMonth.saturdayHorario || null;
      } else {
        const prevConfigs = overrides.filter((o) => o.month < monthStr);
        if (prevConfigs.length > 0) {
          const closest = prevConfigs[prevConfigs.length - 1];
          currentGroup = closest.saturdayGroup || null;
          currentHorario = closest.saturdayHorario || null;
        }
      }

      if (!currentGroup) return null;

      let rotConfig = rotConfigsList.find((c) => c.month === monthStr);
      if (!rotConfig) {
        const sorted = rotConfigsList
          .filter((c) => c.month < monthStr)
          .sort((a, b) => b.month.localeCompare(a.month));
        rotConfig = sorted[0];
      }
      if (!rotConfig) return null;

      const dateObj = new Date(dateStr + "T12:00:00");
      const start = new Date(rotConfig.startDate + "T12:00:00");
      const diffDays = Math.round(
        (dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      const weeksDiff = Math.floor(diffDays / 7);
      const groups = rotConfig.rotationOrder.split(",").map((g) => g.trim());
      const N = groups.length;
      const startIndex = groups.indexOf(rotConfig.startGroup);
      const idx = startIndex >= 0 ? startIndex : 0;
      const activeIndex = (((idx + weeksDiff) % N) + N) % N;
      const activeGroup = groups[activeIndex];

      if (currentGroup === activeGroup) {
        return currentHorario || "07:00 - 13:00";
      }
      return null;
    }

    function resolveHorario(
      logDate: string,
      currentHorario: string | null,
      shiftType?: string,
    ): string {
      if (
        currentHorario &&
        currentHorario !== "--:--" &&
        currentHorario !== "Franco" &&
        currentHorario.trim() !== ""
      ) {
        return currentHorario.trim();
      }

      if (shiftType === "overtime" || otByDate.has(logDate)) {
        const otHorario = otByDate.get(logDate);
        if (otHorario) return otHorario;
      }

      const [y, m, d] = logDate.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      if (dayOfWeek === 6) {
        const satH = resolveSaturdayHorario(logDate);
        if (satH) return satH;
      }

      const sched = schedByDate.get(logDate);
      if (sched) {
        if (
          sched.horario &&
          sched.horario.trim() !== "" &&
          sched.horario !== "Franco" &&
          sched.horario !== "-"
        ) {
          return sched.horario.trim();
        }
        if (sched.status === "Franco") {
          return "--:--";
        }
      }
      if (
        agent.horarioDefault &&
        agent.horarioDefault.trim() !== "" &&
        agent.horarioDefault !== "-"
      ) {
        return agent.horarioDefault.trim();
      }
      return "--:--";
    }

    // 4. Filtrado por estado en memoria
    const filteredLogs = logs.filter((log) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "tardanza")
        return log.cumplimiento === "Llegada Tarde";
      if (statusFilter === "incumplio")
        return log.cumplimiento === "Incumplió";
      if (statusFilter === "cumplio")
        return log.cumplimiento === "Cumplió";
      if (statusFilter === "ausente")
        return Boolean(log.ausencia && log.ausencia.trim() !== "");
      return true;
    });

    // 5. Cálculo de métricas agregadas del período consultado
    let totalWorkDays = 0;
    let punctuals = 0;
    let lates = 0;
    let failed = 0;
    let absences = 0;

    logs.forEach((log) => {
      const effectiveHorario = resolveHorario(
        log.date,
        log.horarioEstipulado,
        log.shiftType,
      );
      const hasSchedule =
        effectiveHorario &&
        effectiveHorario !== "Franco" &&
        effectiveHorario !== "--:--" &&
        effectiveHorario.trim() !== "";
      if (hasSchedule || log.cumplimientoForzado) {
        totalWorkDays++;
        if (log.cumplimiento === "Cumplió") punctuals++;
        if (log.cumplimiento === "Llegada Tarde") lates++;
        if (log.cumplimiento === "Incumplió") failed++;
      }
      if (log.ausencia && log.ausencia.trim() !== "") {
        absences++;
      }
    });

    const punctualityRate =
      totalWorkDays > 0 ? Math.round((punctuals / totalWorkDays) * 100) : 100;

    return jsonResponse(
      {
        operator: agent,
        period: { year, month },
        summary: {
          totalWorkDays,
          punctuals,
          lates,
          failed,
          absences,
          punctualityRate,
        },
        records: filteredLogs.map((log) => {
          const sched = schedByDate.get(log.date);
          const [y, m, d] = log.date.split("-").map(Number);
          const dayOfWeek = new Date(y, m - 1, d).getDay();
          const isSat = dayOfWeek === 6;
          const satHorario = isSat ? resolveSaturdayHorario(log.date) : null;

          let modalidad = sched?.status || null;
          if (log.shiftType === "overtime") {
            modalidad = "HORAS EXTRAS";
          } else if (isSat && satHorario && (!modalidad || modalidad === "Franco")) {
            modalidad = "Home Office";
          }

          return {
            id: log.id,
            date: log.date,
            horarioEstipulado: resolveHorario(
              log.date,
              log.horarioEstipulado,
              log.shiftType,
            ),
            entradaReal: log.entradaReal || "--:--",
            cumplimiento: log.cumplimiento || "Sin Registro",
            cumplimientoForzado: log.cumplimientoForzado ? 1 : 0,
            ausencia: log.ausencia || null,
            motivoLoguin: log.motivoLoguin || null,
            detalle: log.detalle || null,
            shiftType: log.shiftType,
            modalidad,
          };
        }),
        schedules: Object.fromEntries(
          schedList.map((s) => [s.date, { status: s.status, horario: s.horario }]),
        ),
      },
      200,
      "no-store, no-cache, must-revalidate",
    );
  } catch (error: any) {
    console.error("Error en endpoint /api/asistencia/operador/[id]:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
