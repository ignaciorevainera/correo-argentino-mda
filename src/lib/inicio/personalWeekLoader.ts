/**
 * Carga desde SQLite la semana en curso del agente y delega la resolución de
 * cada día en `buildPersonalWeek` (puro, testeable).
 */
import { db } from "@db/index";
import {
  agentSaturdayGroups,
  holidays,
  saturdayRotationConfig,
  schedules,
} from "@db/schema";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { SaturdayRotationConfigLike } from "../cronograma/rotation";
import {
  buildPersonalWeek,
  formatWeekRange,
  getWeekDates,
  toYMD,
  type PersonalWeekDay,
  type SaturdayByMonth,
  type WeekAgent,
  type WeekScheduleRow,
} from "./personalWeek";

/** Mismos valores por defecto que `buildCronogramaPayload` cuando el mes no
 * tiene configuración de rotación propia. */
const DEFAULT_ROTATION: SaturdayRotationConfigLike = {
  rotationOrder: "A,B,C,D",
  startDate: "2026-06-06",
  startGroup: "A",
  disabledGroups: "",
};

export interface PersonalWeek {
  dates: string[];
  days: PersonalWeekDay[];
  rangeLabel: string;
}

function uniqueMonths(dates: string[]): string[] {
  return Array.from(new Set(dates.map((date) => date.slice(0, 7))));
}

/**
 * ¿El agente tiene cronograma materializado para ese mes?
 *
 * El probe es POR AGENTE (no global por mes): que otro operador tenga filas del
 * mes no debe convertir la semana de este usuario en "todo Franco". Es el
 * criterio de `src/lib/attendance.ts`, acotado al agente para que el home no
 * dependa del estado del resto de la mesa.
 */
async function agentHasSchedulesInMonth(
  agentId: number,
  month: string,
): Promise<boolean> {
  const [probe] = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(
      and(
        eq(schedules.agentId, agentId),
        gte(schedules.date, `${month}-01`),
        lte(schedules.date, `${month}-31`),
      ),
    )
    .limit(1);
  return Boolean(probe);
}

export async function loadPersonalWeek(
  agentId: number,
  agent: WeekAgent,
  ref: Date = new Date(),
): Promise<PersonalWeek> {
  const dates = getWeekDates(ref);
  const months = uniqueMonths(dates);

  const [rows, holidayRows, rotationRows, saturdayRows, scheduledFlags] =
    await Promise.all([
      db
        .select({
          date: schedules.date,
          status: schedules.status,
          horario: schedules.horario,
          breakInicio: schedules.breakInicio,
          breakFin: schedules.breakFin,
          isOverride: schedules.isOverride,
        })
        .from(schedules)
        .where(
          and(eq(schedules.agentId, agentId), inArray(schedules.date, dates)),
        ),
      db
        .select({ date: holidays.date, name: holidays.name })
        .from(holidays)
        .where(inArray(holidays.date, dates)),
      db
        .select()
        .from(saturdayRotationConfig)
        .orderBy(desc(saturdayRotationConfig.month)),
      db
        .select()
        .from(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.agentId, agentId))
        .orderBy(desc(agentSaturdayGroups.month)),
      Promise.all(months.map((month) => agentHasSchedulesInMonth(agentId, month))),
    ]);

  const scheduledMonths = months.filter((_, i) => scheduledFlags[i]);

  const holidayMap: Record<string, string> = {};
  for (const holiday of holidayRows) holidayMap[holiday.date] = holiday.name;

  const rotationConfigByMonth: Record<string, SaturdayRotationConfigLike | null> =
    {};
  const saturdayByMonth: Record<string, SaturdayByMonth> = {};
  for (const month of months) {
    rotationConfigByMonth[month] =
      rotationRows.find((row) => row.month === month) ??
      rotationRows.find((row) => row.month < month) ??
      DEFAULT_ROTATION;

    const groupRow =
      saturdayRows.find((row) => row.month === month) ??
      saturdayRows.find((row) => row.month < month);
    saturdayByMonth[month] = {
      group: groupRow?.saturdayGroup ?? agent.saturdayGroup ?? null,
      horario: groupRow?.saturdayHorario ?? agent.saturdayHorario ?? null,
    };
  }

  const normalizedRows: WeekScheduleRow[] = rows.map((row) => ({
    date: row.date,
    status: row.status,
    horario: row.horario,
    breakInicio: row.breakInicio,
    breakFin: row.breakFin,
    isOverride: row.isOverride ?? false,
  }));

  const days = buildPersonalWeek({
    weekDates: dates,
    todayStr: toYMD(new Date()),
    agent,
    rows: normalizedRows,
    scheduledMonths,
    holidays: holidayMap,
    rotationConfigByMonth,
    saturdayByMonth,
  });

  return { dates, days, rangeLabel: formatWeekRange(dates) };
}
