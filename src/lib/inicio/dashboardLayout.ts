/**
 * Layout configurable del home por usuario.
 *
 * Patrón: una card grande (2/3 del ancho) y la columna derecha con dos cards
 * apiladas. La densidad es automática por slot: la grande renderiza la versión
 * completa, la columna derecha las compactas.
 *
 * La lista blanca es por **jerarquía de rol**: admin ⊃ supervisor ⊃
 * team_leader ⊃ referente ⊃ agent. Un rol superior puede montar los widgets de
 * los roles que supera; la disponibilidad de datos se filtra aparte.
 *
 * Persistencia (JSON en `users.dashboard_layout`):
 * `{ version: 2, profiles: { [profile]: { big, side } }, accessByRole: { [role]: string[] } }`
 */
import { normalizeRole } from "../rbac";
import type { HomeProfile } from "./homeProfile";

export type DashboardWidgetId =
  | "week"
  | "quality"
  | "quality-team"
  | "automation"
  | "feedback"
  | "users"
  | "audit"
  | "ags";

export interface DashboardWidgetMeta {
  id: DashboardWidgetId;
  label: string;
}

export const DASHBOARD_WIDGETS: readonly DashboardWidgetMeta[] = [
  { id: "week", label: "Mi semana" },
  { id: "quality", label: "Mi calidad" },
  { id: "quality-team", label: "Calidad del equipo" },
  { id: "ags", label: "Próximo en autogestiones" },
  { id: "automation", label: "Automatizaciones" },
  { id: "audit", label: "Registro de auditoría" },
  { id: "feedback", label: "Sugerencias y reportes" },
  { id: "users", label: "Gestión de usuarios" },
] as const;

export interface DashboardLayout {
  big: DashboardWidgetId;
  side: DashboardWidgetId[];
}

export interface StoredDashboard {
  version: 2;
  profiles: Record<string, DashboardLayout>;
  accessByRole: Record<string, string[]>;
}

/** Rol efectivo de cada perfil de home. */
const AGENT_WIDGETS: DashboardWidgetId[] = [
  "week",
  "quality",
  "ags",
  "automation",
];
const REFERENT_WIDGETS: DashboardWidgetId[] = [
  ...AGENT_WIDGETS,
  "quality-team",
];
const ADMIN_WIDGETS: DashboardWidgetId[] = [
  ...REFERENT_WIDGETS,
  "audit",
  "feedback",
  "users",
];

export function allowedWidgetsForRole(role: string): DashboardWidgetId[] {
  const normalized = normalizeRole(role);
  // Siempre una copia: los consumidores no deben poder mutar la lista base.
  if (normalized === "admin") return [...ADMIN_WIDGETS];
  if (normalized === "supervisor") return [...REFERENT_WIDGETS];
  if (normalized === "team_leader") return [...REFERENT_WIDGETS];
  if (normalized === "referent") return [...REFERENT_WIDGETS];
  return [...AGENT_WIDGETS];
}

export const DEFAULT_ACCESS_COUNT = 8;

/**
 * Resuelve la lista ordenada de accesos de abajo del home.
 *
 * - Sin configuración guardada: las primeras `DEFAULT_ACCESS_COUNT` permitidas.
 * - Con configuración: respeta el orden guardado y descarta hrefs que el rol ya
 *   no permite. Un array vacío es válido (el usuario eligió no mostrar cards).
 */
export function resolveAccessList(
  raw: unknown,
  permitted: string[],
): string[] {
  const permittedSet = new Set(permitted);

  if (raw === undefined || raw === null) {
    return permitted.slice(0, DEFAULT_ACCESS_COUNT);
  }
  if (!Array.isArray(raw)) {
    return permitted.slice(0, DEFAULT_ACCESS_COUNT);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    if (!permittedSet.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** Lee los accesos guardados de un rol desde el JSON crudo. */
export function resolveStoredAccess(
  raw: unknown,
  role: string,
  permitted: string[],
): string[] {
  const store = parseStoredDashboard(raw, "base");
  return resolveAccessList(store.accessByRole[normalizeRole(role)], permitted);
}

/**
 * Widgets permitidos para un perfil: la lista blanca del rol efectivo (jerarquía)
 * más los widgets que el perfil usa por defecto. Así, por ejemplo, un agente
 * "solo calidad" conserva la card de Calidad del equipo aunque su rol sea
 * `agent`.
 */
export function allowedWidgetsFor(
  profile: HomeProfile,
  role: string,
): DashboardWidgetId[] {
  const base = [...allowedWidgetsForRole(role)];
  const defaults = DEFAULT_BY_PROFILE[profile];
  if (defaults) {
    for (const id of [defaults.big, ...defaults.side]) {
      if (!base.includes(id)) base.push(id);
    }
  }
  return base;
}

const DEFAULT_BY_PROFILE: Record<HomeProfile, DashboardLayout | null> = {
  operador: { big: "week", side: ["ags", "quality"] },
  referente: { big: "week", side: ["ags", "quality-team"] },
  supervisor: { big: "quality-team", side: ["ags", "automation"] },
  admin: { big: "audit", side: ["feedback", "users"] },
  calidad: { big: "quality-team", side: ["ags", "quality"] },
  base: null,
};

export function widgetLabel(id: DashboardWidgetId): string {
  return DASHBOARD_WIDGETS.find((widget) => widget.id === id)?.label ?? id;
}

export function isDashboardWidget(value: unknown): value is DashboardWidgetId {
  return DASHBOARD_WIDGETS.some((widget) => widget.id === value);
}

export function defaultLayout(profile: HomeProfile): DashboardLayout | null {
  const layout = DEFAULT_BY_PROFILE[profile];
  return layout ? { big: layout.big, side: [...layout.side] } : null;
}

/**
 * Normaliza el JSON guardado. Acepta el formato viejo `{ big, side }` y lo
 * interpreta como el layout del perfil real (`realProfile`).
 */
export function parseStoredDashboard(
  raw: unknown,
  realProfile: HomeProfile,
): StoredDashboard {
  const store: StoredDashboard = {
    version: 2,
    profiles: {},
    accessByRole: {},
  };

  if (!raw || typeof raw !== "object") return store;
  const value = raw as Record<string, unknown>;

  if (value.profiles && typeof value.profiles === "object") {
    for (const [profile, layout] of Object.entries(
      value.profiles as Record<string, unknown>,
    )) {
      const candidate = layout as Partial<DashboardLayout> | null;
      if (!candidate || typeof candidate.big !== "string") continue;
      if (!isDashboardWidget(candidate.big)) continue;
      const side = Array.isArray(candidate.side)
        ? candidate.side.filter(isDashboardWidget)
        : [];
      store.profiles[profile] = { big: candidate.big, side };
    }
  } else if (typeof value.big === "string" && isDashboardWidget(value.big)) {
    // Legacy: el layout no distinguía perfiles.
    const side = Array.isArray(value.side)
      ? value.side.filter(isDashboardWidget)
      : [];
    store.profiles[realProfile] = { big: value.big, side };
  }

  if (value.accessByRole && typeof value.accessByRole === "object") {
    for (const [role, hrefs] of Object.entries(
      value.accessByRole as Record<string, unknown>,
    )) {
      if (!Array.isArray(hrefs)) continue;
      store.accessByRole[normalizeRole(role)] = hrefs.filter(
        (href): href is string => typeof href === "string",
      );
    }
  }

  return store;
}

/**
 * Resuelve el layout de un perfil contra los widgets realmente disponibles
 * (datos + permisos). Cualquier valor inválido cae al default del perfil y, si
 * el default tampoco está disponible, al primer widget disponible.
 */
export function resolveDashboardLayout(params: {
  profile: HomeProfile;
  role: string;
  raw: unknown;
  available: DashboardWidgetId[];
}): DashboardLayout | null {
  const { profile, role, raw } = params;
  const allowed = allowedWidgetsFor(profile, role);
  const available = params.available.filter((id) => allowed.includes(id));

  if (available.length === 0) return null;

  const fallback = defaultLayout(profile);
  const rawLayout =
    raw && typeof raw === "object" ? (raw as Partial<DashboardLayout>) : null;

  const pickBig = (candidate: unknown): DashboardWidgetId | null =>
    typeof candidate === "string" &&
    isDashboardWidget(candidate) &&
    available.includes(candidate)
      ? candidate
      : null;

  const big =
    pickBig(rawLayout?.big) ??
    (fallback && available.includes(fallback.big) ? fallback.big : available[0]);

  const side: DashboardWidgetId[] = [];
  const push = (candidate: unknown) => {
    if (typeof candidate !== "string" || !isDashboardWidget(candidate)) return;
    if (candidate === big || side.includes(candidate)) return;
    if (!available.includes(candidate)) return;
    if (side.length < 2) side.push(candidate);
  };

  if (Array.isArray(rawLayout?.side)) {
    for (const candidate of rawLayout.side) push(candidate);
  }
  for (const candidate of fallback?.side ?? []) push(candidate);
  for (const candidate of available) push(candidate);

  return { big, side };
}
