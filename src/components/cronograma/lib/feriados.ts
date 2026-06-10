/**
 * Dictionary mapping Argentine holiday dates (YYYY-MM-DD keys) to their names
 * for the years 2025, 2026, and 2027.
 */
export const FERIADOS: Record<string, string> = {
  // 2025
  '2025-01-01': 'Año Nuevo',
  '2025-02-16': 'Carnaval',
  '2025-02-17': 'Carnaval',
  '2025-03-23': 'Feriado con fines turísticos',
  '2025-03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
  '2025-04-02': 'Día del Veterano y de los Caídos en la Guerra de Malvinas',
  '2025-04-18': 'Viernes Santo',
  '2025-05-01': 'Día del Trabajador',
  '2025-05-25': 'Día de la Revolución de Mayo',
  '2025-06-15': 'Paso a la Inmortalidad del General Martín Miguel de Güemes',
  '2025-06-20': 'Paso a la Inmortalidad del Gral. Manuel Belgrano',
  '2025-07-09': 'Día de la Independencia',
  '2025-07-10': 'Feriado con fines turísticos',
  '2025-08-17': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2025-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2025-11-20': 'Día de la Soberanía Nacional',
  '2025-12-08': 'Inmaculada Concepción',
  '2025-12-25': 'Navidad',

  // 2026
  '2026-01-01': 'Año Nuevo',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-03-23': 'Feriado con fines turísticos',
  '2026-03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
  '2026-04-02': 'Día del Veterano y de los Caídos en la Guerra de Malvinas',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajador',
  '2026-05-25': 'Día de la Revolución de Mayo',
  '2026-06-15': 'Paso a la Inmortalidad del General Martín Miguel de Güemes',
  '2026-06-20': 'Paso a la Inmortalidad del Gral. Manuel Belgrano',
  '2026-07-09': 'Día de la Independencia',
  '2026-07-10': 'Feriado con fines turísticos',
  '2026-08-17': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2026-11-23': 'Día de la Soberanía Nacional',
  '2026-12-07': 'Feriado con fines turísticos',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',

  // 2027
  '2027-01-01': 'Año Nuevo',
  '2027-02-08': 'Carnaval',
  '2027-02-09': 'Carnaval',
  '2027-03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
  '2027-03-26': 'Viernes Santo',
  '2027-04-02': 'Día del Veterano y de los Caídos en la Guerra de Malvinas',
  '2027-05-01': 'Día del Trabajador',
  '2027-05-25': 'Día de la Revolución de Mayo',
  '2027-06-20': 'Paso a la Inmortalidad del Gral. Manuel Belgrano',
  '2027-07-09': 'Día de la Independencia',
  '2027-08-16': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2027-11-22': 'Día de la Soberanía Nacional',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
};

/**
 * Checks if a given date string exists in the FERIADOS dictionary.
 * @param dateStr The date in YYYY-MM-DD format.
 */
export function isFeriado(dateStr: string): boolean {
  return dateStr in FERIADOS;
}

/**
 * Gets the name of the holiday for a given date string.
 * @param dateStr The date in YYYY-MM-DD format.
 * @returns The holiday name or undefined if the date is not a holiday.
 */
export function getFeriadoName(dateStr: string): string | undefined {
  return FERIADOS[dateStr];
}
