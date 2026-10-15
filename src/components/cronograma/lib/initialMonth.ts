/**
 * Regla única de mes inicial (cliente y servidor). No depende de `uniqueDates`
 * (que ordenado ascendente sesgaba al mes más futuro): prioriza el mes en curso,
 * luego el cargado más cercano hacia atrás, luego el más cercano hacia adelante.
 */
export function resolveInitialMonth(
  availableMonths: readonly string[],
  currentMonth: string,
): string {
  if (availableMonths.includes(currentMonth)) return currentMonth;
  const pastOrEqual = availableMonths.filter((m) => m <= currentMonth).sort();
  if (pastOrEqual.length > 0) return pastOrEqual[pastOrEqual.length - 1];
  const future = availableMonths.filter((m) => m > currentMonth).sort();
  return future[0] ?? currentMonth;
}
