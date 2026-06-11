import { state } from './state';

/**
 * Checks if a given date string exists in the state.feriados dictionary.
 * @param dateStr The date in YYYY-MM-DD format.
 */
export function isFeriado(dateStr: string): boolean {
  return dateStr in state.feriados;
}

/**
 * Gets the name of the holiday for a given date string.
 * @param dateStr The date in YYYY-MM-DD format.
 * @returns The holiday name or undefined if the date is not a holiday.
 */
export function getFeriadoName(dateStr: string): string | undefined {
  return state.feriados[dateStr];
}

