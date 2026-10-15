import type { ViewColumns } from "./viewMode";

/**
 * Fuente única del cap responsive de columnas de /recursos.
 *
 * El inline de BaseLayout (pre-paint, no puede importar) recibe estos umbrales
 * por `define:vars`; el island de EnlacesContent los importa. Ambos miden el
 * MISMO ancho (viewport) para que el primer frame y el layout hidratado no
 * discrepen (ver #123, causa 1) -> sin relayout al hidratar.
 */
export const COLUMN_CAP_SM = 768;
export const COLUMN_CAP_LG = 1280;

export function getColumnCap(width: number): ViewColumns {
  if (width < COLUMN_CAP_SM) return 1;
  if (width < COLUMN_CAP_LG) return 2;
  return 4;
}

export function resolveEffectiveColumns(
  pref: ViewColumns,
  width: number,
): ViewColumns {
  return Math.min(pref, getColumnCap(width)) as ViewColumns;
}
