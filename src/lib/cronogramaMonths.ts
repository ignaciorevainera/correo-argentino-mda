/**
 * Helpers puros de meses para cronograma. Sin dependencias de DB ni de DOM:
 * los consumen tanto los endpoints (server) como el cliente del dashboard.
 * El "mes actual" SIEMPRE se deriva en hora local (nunca `toISOString`, que es
 * UTC y desfasa de noche en Argentina UTC-3 — ver issue #263).
 */

/** "YYYY-MM" del mes local de `now` (por defecto, ahora). */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" a partir de year + month 0-indexado. */
export function monthKeyPrefix(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export interface ParsedYearMonth {
  year: number;
  month: number;
  prefix: string;
}

/**
 * Valida y normaliza `{ year, month }` crudos de un body JSON.
 * Acepta strings numéricos ("10"). Devuelve null si falta, no es entero o
 * está fuera de rango (año 2000-2100, mes 0-11). Unifica la validación de
 * POST y DELETE de meses (#272) y habilita el guard de alta (#141/#273).
 */
export function parseYearMonth(body: {
  year?: unknown;
  month?: unknown;
} | null): ParsedYearMonth | null {
  if (!body || body.year == null || body.month == null) return null;
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 0 || month > 11) return null;
  return { year, month, prefix: monthKeyPrefix(year, month) };
}

/**
 * Regla única de "mes inicial" (#139). Orden:
 *  1. el mes de `today` si está en `availableMonths`;
 *  2. si no, el mes cargado más cercano hacia atrás (<= today);
 *  3. si no hay ninguno anterior, el más cercano hacia adelante;
 *  4. `today` como último recurso.
 * Nunca devuelve un mes más futuro cuando existe uno en curso o anterior.
 */
export function resolveInitialMonth(
  availableMonths: string[],
  today: string,
): string {
  const months = [...availableMonths].filter(Boolean).sort();
  const todayMonth = today.slice(0, 7);
  if (months.includes(todayMonth)) return todayMonth;
  const pastOrCurrent = months.filter((m) => m <= todayMonth);
  if (pastOrCurrent.length > 0) return pastOrCurrent[pastOrCurrent.length - 1];
  if (months.length > 0) return months[0];
  return todayMonth;
}
