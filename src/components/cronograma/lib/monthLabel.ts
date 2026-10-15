/**
 * Derivadores puros del selector de mes (Mensual/Grupos/Pasiva).
 *
 * El "mes actual" (marcador `(mes actual)`) se calcula en cada render, no al
 * cargar el módulo: una pestaña abierta por varias horas cruza de mes y debe
 * marcar el nuevo mes sin recargar.
 */
export const MESES_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

export function currentMonthYM(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthOptionLabel(ymStr: string, todayYM: string): string {
  const [year, monthStr] = ymStr.split("-");
  const month = parseInt(monthStr, 10) - 1;
  const label = `${MESES_ES[month]} ${year}`;
  return ymStr === todayYM ? `${label} (mes actual)` : label;
}

export const EMPTY_MONTH_OPTION_HTML = `<option value="" disabled selected>Sin meses disponibles</option>`;

export function monthOptionsHtml(
  months: readonly string[],
  todayYM: string,
): string {
  if (months.length === 0) return EMPTY_MONTH_OPTION_HTML;
  return months
    .map(
      (ymStr) => `<option value="${ymStr}-01">${monthOptionLabel(ymStr, todayYM)}</option>`,
    )
    .join("");
}
