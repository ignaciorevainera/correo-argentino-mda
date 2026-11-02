/**
 * Semana en curso del cronograma personal. Funciones puras: reciben las filas
 * de `schedules` ya cargadas y resuelven el plan de cada día. La carga desde la
 * DB vive en `personalWeekLoader.ts` para poder testear la regla sin abrir la
 * base.
 *
 * La regla replica la de `src/lib/attendance.ts`:
 * - mes generado (tiene filas) → la fila manda; sin fila = Franco.
 * - mes sin generar → esquema semanal del agente.
 * - sábado con fila no override → rotación de sábados (Home Office).
 */
import type { SaturdayRotationConfigLike } from "../cronograma/rotation";
import { isSaturdayRotationActive } from "../cronograma/rotation";

export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
] as const;

export const SHORT_DAY_NAMES = [
  "Dom",
  "Lun",
  "Mar",
  "Mie",
  "Jue",
  "Vie",
  "Sab",
] as const;

const NON_WORKING_STATUSES = new Set(["Franco", "Vacaciones", "Licencia"]);

export interface WeekAgent {
  esquemaSemanal?: Record<string, string> | null;
  esquemaHorario?: Record<string, string> | null;
  esquemaBreakInicio?: Record<string, string> | null;
  esquemaBreakFin?: Record<string, string> | null;
  horarioDefault?: string | null;
  saturdayGroup?: string | null;
  saturdayHorario?: string | null;
}

export interface WeekScheduleRow {
  date: string;
  status: string;
  horario: string | null;
  breakInicio: string | null;
  breakFin: string | null;
  isOverride: boolean | null;
}

export interface SaturdayByMonth {
  group: string | null;
  horario: string | null;
}

export interface BuildPersonalWeekParams {
  /** Fechas de la semana, en orden (lunes → sábado). */
  weekDates: string[];
  /** Hoy en YYYY-MM-DD, para marcar la celda. */
  todayStr: string;
  agent: WeekAgent;
  /** Filas de `schedules` del agente para esas fechas. */
  rows: WeekScheduleRow[];
  /** Meses (YYYY-MM) que ya tienen cronograma generado. */
  scheduledMonths: string[];
  /** Feriados de la semana, indexados por fecha. */
  holidays: Record<string, string>;
  rotationConfigByMonth: Record<string, SaturdayRotationConfigLike | null>;
  saturdayByMonth: Record<string, SaturdayByMonth>;
}

export interface PersonalWeekDay {
  date: string;
  dayName: string;
  shortLabel: string;
  status: string;
  horario: string;
  breakInicio: string;
  breakFin: string;
  isToday: boolean;
  holiday: string | null;
  isSaturdayRotation: boolean;
}

export function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Lunes 12:00 de la semana de `ref` (el domingo pertenece a la semana previa). */
export function startOfWeek(ref: Date = new Date()): Date {
  const monday = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate(),
    12,
    0,
    0,
    0,
  );
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  return monday;
}

/** Fechas de lunes a sábado de la semana de `ref`. */
export function getWeekDates(ref: Date = new Date()): string[] {
  const monday = startOfWeek(ref);
  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return toYMD(date);
  });
}

function cleanHorario(value: string | null | undefined): string {
  const horario = (value ?? "").trim();
  return horario === "-" ? "" : horario;
}

export function buildPersonalWeek({
  weekDates,
  todayStr,
  agent,
  rows,
  scheduledMonths,
  holidays,
  rotationConfigByMonth,
  saturdayByMonth,
}: BuildPersonalWeekParams): PersonalWeekDay[] {
  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const scheduled = new Set(scheduledMonths);

  return weekDates.map((date) => {
    const dateObj = new Date(`${date}T12:00:00`);
    const weekday = dateObj.getDay();
    const dayName = DAY_NAMES[weekday];
    const month = date.slice(0, 7);
    const row = rowsByDate.get(date);
    const saturdayConfig = saturdayByMonth[month] ?? {
      group: agent.saturdayGroup ?? null,
      horario: agent.saturdayHorario ?? null,
    };

    let status = "Franco";
    let horario = "";
    let breakInicio = "";
    let breakFin = "";
    let isSaturdayRotation = false;

    if (scheduled.has(month)) {
      const rowStatus = (row?.status ?? "").trim();
      const baseStatus = rowStatus === "" ? "Franco" : rowStatus;

      if (weekday === 6) {
        if (row?.isOverride) {
          status = baseStatus;
          horario = cleanHorario(row.horario);
          breakInicio = (row.breakInicio ?? "").trim();
          breakFin = (row.breakFin ?? "").trim();
        } else if (
          isSaturdayRotationActive(
            rotationConfigByMonth[month],
            saturdayConfig?.group,
            date,
          )
        ) {
          status = "Home Office";
          horario = cleanHorario(saturdayConfig?.horario) || "07:00 - 13:00";
          isSaturdayRotation = true;
        } else {
          status = "Franco";
        }
      } else {
        status = baseStatus;
        horario = cleanHorario(row?.horario);
        breakInicio = (row?.breakInicio ?? "").trim();
        breakFin = (row?.breakFin ?? "").trim();
      }
    } else {
      status = (agent.esquemaSemanal?.[dayName] ?? "").trim() || "Franco";
      horario = cleanHorario(agent.esquemaHorario?.[dayName]);
      breakInicio = (agent.esquemaBreakInicio?.[dayName] ?? "").trim();
      breakFin = (agent.esquemaBreakFin?.[dayName] ?? "").trim();

      if (
        weekday === 6 &&
        status === "Franco" &&
        isSaturdayRotationActive(
          rotationConfigByMonth[month],
          saturdayConfig?.group,
          date,
        )
      ) {
        status = "Home Office";
        horario = cleanHorario(saturdayConfig?.horario) || "07:00 - 13:00";
        isSaturdayRotation = true;
        breakInicio = "";
        breakFin = "";
      }
    }

    if (NON_WORKING_STATUSES.has(status)) {
      horario = "";
      breakInicio = "";
      breakFin = "";
    } else if (!horario) {
      horario = cleanHorario(agent.horarioDefault);
    }

    // Un break sin horario no aporta nada: se oculta junto con el turno.
    if (!horario) {
      breakInicio = "";
      breakFin = "";
    }

    return {
      date,
      dayName,
      shortLabel: SHORT_DAY_NAMES[weekday],
      status,
      horario,
      breakInicio,
      breakFin,
      isToday: date === todayStr,
      holiday: holidays[date] ?? null,
      isSaturdayRotation,
    };
  });
}

/** Rango legible de la semana, ej. "19 al 24 de octubre". */
export function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) return "";
  const [first, last] = [dates[0], dates[dates.length - 1]];
  const firstDate = new Date(`${first}T12:00:00`);
  const lastDate = new Date(`${last}T12:00:00`);
  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const firstMonth = monthNames[firstDate.getMonth()];
  const lastMonth = monthNames[lastDate.getMonth()];
  const sameMonth = firstDate.getMonth() === lastDate.getMonth();

  if (sameMonth) {
    return `${firstDate.getDate()} al ${lastDate.getDate()} de ${firstMonth}`;
  }
  return `${firstDate.getDate()} de ${firstMonth} al ${lastDate.getDate()} de ${lastMonth}`;
}
