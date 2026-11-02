/**
 * Rotación de sábados: regla única compartida por el cronograma (payload del
 * mes) y el home personalizado. Antes vivía duplicada dentro de
 * `buildCronogramaPayload`; extraerla evita que ambas vistas muestren sábados
 * distintos.
 */

export interface SaturdayRotationConfigLike {
  /** Grupos separados por coma, ej. "A,B,C,D". */
  rotationOrder: string;
  /** Sábado en el que arranca la rotación (YYYY-MM-DD). */
  startDate: string;
  /** Grupo que trabaja ese primer sábado. */
  startGroup: string;
  /** Grupos dados de baja para ese mes, separados por coma. */
  disabledGroups?: string | null;
}

export function parseDisabledGroups(
  raw: string | null | undefined,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * ¿Al grupo del agente le toca el sábado de rotación en `dateStr`?
 *
 * Sólo devuelve `true` para sábados hábiles: si el grupo está deshabilitado
 * para ese mes, si la fecha no es sábado o si no hay grupo, no hay rotación.
 */
export function isSaturdayRotationActive(
  config: SaturdayRotationConfigLike | null | undefined,
  saturdayGroup: string | null | undefined,
  dateStr: string,
): boolean {
  const group = (saturdayGroup ?? "").trim();
  if (!config || !group) return false;

  const dateObj = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(dateObj.getTime()) || dateObj.getDay() !== 6) return false;

  if (parseDisabledGroups(config.disabledGroups).includes(group)) {
    return false;
  }

  const groups = (config.rotationOrder ?? "").split(",").map((g) => g.trim());
  const total = groups.length;
  // Un orden vacío cae en [""] (length 1): sin grupos reales no hay rotación.
  if (total === 0 || !groups.some((g) => g !== "")) return false;

  const start = new Date(`${config.startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return false;

  const diffDays = Math.round(
    (dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  const weeksDiff = Math.floor(diffDays / 7);
  const startIndex = groups.indexOf(config.startGroup);
  const index = ((((startIndex >= 0 ? startIndex : 0) + weeksDiff) % total) + total) % total;

  return groups[index] === group;
}
