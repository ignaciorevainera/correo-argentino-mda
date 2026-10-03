import { getCategories } from "@lib/invgate/automation/categories";
import type { InvgateCategoryNode } from "@lib/invgate/automation/categories";
import { getServerEnv } from "@lib/invgate/automation/env";
import {
  readPersistedCache,
  writePersistedCache,
} from "@lib/invgate/cache";
import { normalizeForCompare } from "./labels";

/**
 * Rutas verbatim de la categoría hoja de automatizaciones, validadas contra
 * producción. Los IDs internos de InvGate NO son estables entre instancias
 * (en QA la hoja era 86; en producción 86 es "Impresoras (GEN) -
 * Configuración"), por lo que la resolución es por nombre/ruta, nunca por ID.
 *
 * La hoja fue renombrada a "Automatizar sucursal"; se mantiene la variante
 * previa ("Automatización de sucursal") por si el nombre vuelve.
 */
const AUTOMATION_CATEGORY_PATHS: readonly string[][] = [
  [
    "TI Tecnologia informatica",
    "Gestión de Servicios",
    "Mesa de Coordinación",
    "Proyectos",
    "Automatizar sucursal",
  ],
  [
    "TI Tecnologia informatica",
    "Gestión de Servicios",
    "Mesa de Coordinación",
    "Proyectos",
    "Automatización de sucursal",
  ],
];

/** Fallback por nombre: matchea "Automatizar sucursal" / "Automatización de sucursal". */
const AUTOMATION_CATEGORY_NAME_PATTERN = /^automatiz(ar|acion)( de)? suc\b/;

/** Cache por proceso: la resolución cuesta ~6 llamadas paginadas de /categories. */
let cachedCategoryId: number | null = null;

/** Persistencia cross-restart: el árbol de categorías cambia muy rara vez. */
const CATEGORY_CACHE_KEY = "automation.category_id";
const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60_000;

function rememberCategory(id: number): number {
  cachedCategoryId = id;
  writePersistedCache(CATEGORY_CACHE_KEY, id, CATEGORY_CACHE_TTL_MS);
  return id;
}

/** Ruta completa raíz -> hoja (tolera padres ausentes por paginación parcial). */
function fullPathOf(
  category: InvgateCategoryNode,
  byId: Map<number, InvgateCategoryNode>,
): string[] {
  const parts: string[] = [category.name];
  const seen = new Set<number>([category.id]);
  let current: InvgateCategoryNode | undefined = category;

  while (
    current?.parent_category_id != null &&
    !seen.has(current.parent_category_id)
  ) {
    current = byId.get(current.parent_category_id);
    if (!current) break;
    seen.add(current.id);
    parts.unshift(current.name);
  }

  return parts;
}

/**
 * Resuelve el ID de la categoría hoja "Automatización de sucursal" dentro
 * del sector Mesa de Coordinación. Prioridad:
 * 1. Override explícito INVGATE_AUTOMATION_CATEGORY_ID (operación/urgencias).
 * 2. Camino por nombres (cacheado): el tramo debe aparecer como sufijo de la
 *    ruta completa del candidato, para no matchear homónimos de otras ramas.
 * Si no resuelve, falla con mensaje visible — nunca hay fallback a IDs
 * hardcodeados de otra instancia.
 */
export async function resolveAutomationCategoryId(): Promise<number> {
  const override = Number.parseInt(
    getServerEnv("INVGATE_AUTOMATION_CATEGORY_ID"),
    10,
  );
  if (Number.isInteger(override)) {
    return override;
  }

  if (cachedCategoryId !== null) {
    return cachedCategoryId;
  }

  const persisted = readPersistedCache<number>(CATEGORY_CACHE_KEY);
  if (typeof persisted === "number") {
    cachedCategoryId = persisted;
    return persisted;
  }

  const result = await getCategories();

  if (!result.ok) {
    throw new Error(
      `No se pudo obtener el árbol de categorías de InvGate: ${result.message}`,
    );
  }

  const byId = new Map(result.data.map((node) => [node.id, node]));
  const paths = AUTOMATION_CATEGORY_PATHS.map((path) =>
      path.map(normalizeForCompare).join(" » "),
  );
  const candidates: { node: InvgateCategoryNode; path: string }[] = [];

  for (const node of result.data) {
    const normalizedPath = fullPathOf(node, byId)
      .map(normalizeForCompare)
      .join(" » ");

    for (const expected of paths) {
      // Coincidencia exacta.
      if (normalizedPath === expected) {
        return rememberCategory(node.id);
      }
      // La ruta de referencia puede colgar de un árbol diferente (homónimos
      // de otras ramas cubren el mismatch solo con enlace de niveles).
      if (normalizedPath.endsWith(` » ${expected}`)) {
        candidates.push({ node, path: normalizedPath });
        break;
      }
    }
  }

  if (candidates.length === 1) {
    return rememberCategory(candidates[0].node.id);
  }

  if (candidates.length > 1) {
    const listing = candidates
      .map((candidate) => `${candidate.node.id} (${candidate.path})`)
      .join("; ");
    throw new Error(
      `Se encontró múltiples categorías hoja con rutas tipo "Automatización de sucursal": ${listing}. Configurá INVGATE_AUTOMATION_CATEGORY_ID.`,
    );
  }

  const fallback = result.data.filter(
    (node) =>
      AUTOMATION_CATEGORY_NAME_PATTERN.test(normalizeForCompare(node.name)),
  );
  if (fallback.length === 1) {
    return rememberCategory(fallback[0].id);
  }

  const automationNamed = result.data
    .filter((node) => /automatizaci/i.test(node.name))
    .map((node) => `${node.id} (${fullPathOf(node, byId).join(" » ")})`)
    .join("; ");

  throw new Error(
    `No se pudo resolver la categoría "Automatización de sucursal". ${automationNamed ? `Candidatas con nombre similar: ${automationNamed}. ` : ""}Verificá la ruta o configurá INVGATE_AUTOMATION_CATEGORY_ID.`,
  );
}

/** Cache por proceso del mapa id → ruta normalizada. */
let cachedPathMap: Map<number, string> | null = null;
const CATEGORY_PATHS_CACHE_KEY = "automation.category_paths";

/**
 * Mapa `category_id → ruta completa normalizada` de todo el árbol de InvGate
 * (cache 24 h, memoria + SQLite). Lo usa el matcher de etapas para agrupar
 * tickets por ruta cuando el título no alcanza. Devuelve un mapa vacío si falla.
 */
export async function getCategoryPathMap(): Promise<Map<number, string>> {
  if (cachedPathMap) {
    return cachedPathMap;
  }

  const persisted =
    readPersistedCache<Record<string, string>>(CATEGORY_PATHS_CACHE_KEY);
  if (persisted) {
    cachedPathMap = new Map(
      Object.entries(persisted).map(([key, value]) => [Number(key), value]),
    );
    return cachedPathMap;
  }

  const result = await getCategories();
  if (!result.ok) {
    return new Map();
  }

  const byId = new Map(result.data.map((node) => [node.id, node]));
  const map = new Map<number, string>();
  for (const node of result.data) {
    map.set(
      node.id,
      fullPathOf(node, byId).map(normalizeForCompare).join(" » "),
    );
  }

  cachedPathMap = map;
  writePersistedCache(
    CATEGORY_PATHS_CACHE_KEY,
    Object.fromEntries(map),
    CATEGORY_CACHE_TTL_MS,
  );
  return map;
}
