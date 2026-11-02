/**
 * Simulador de vista para administradores ("ver como").
 *
 * Alcance: SOLO la capa de presentación (home, sidebar, cards). No modifica la
 * autorización real del middleware ni de las APIs: un admin conserva su acceso
 * y la simulación no puede escalar privilegios.
 *
 * La cookie se acepta únicamente si el rol real es admin (fail-closed) y el
 * valor está en la lista blanca.
 */
import { normalizeRole } from "./rbac";
import type { HomeProfile } from "./inicio/homeProfile";

export const VIEW_AS_COOKIE = "view_as";
export const VIEW_AS_MAX_AGE_SECONDS = 8 * 60 * 60;

export type ViewProfileId = "operador" | "referente" | "supervisor";

export interface ViewProfile {
  id: ViewProfileId;
  label: string;
  /** Rol efectivo que se usa para filtrar navegación y accesos. */
  role: "agent" | "referent" | "supervisor";
  /** Perfil que resuelve `PersonalHome`. */
  homeProfile: HomeProfile;
}

export const VIEW_PROFILES: readonly ViewProfile[] = [
  {
    id: "operador",
    label: "Operador",
    role: "agent",
    homeProfile: "operador",
  },
  {
    id: "referente",
    label: "Referente",
    role: "referent",
    homeProfile: "referente",
  },
  {
    id: "supervisor",
    label: "Supervisor",
    role: "supervisor",
    homeProfile: "supervisor",
  },
] as const;

export function getViewProfile(
  id: string | null | undefined,
): ViewProfile | null {
  if (!id) return null;
  return VIEW_PROFILES.find((profile) => profile.id === id) ?? null;
}

/**
 * Sólo un admin real puede simular. Cualquier otro rol (o un valor inválido)
 * devuelve `null` y la vista real se mantiene.
 */
export function resolveViewAs(
  realRole: string | null | undefined,
  cookieValue: string | null | undefined,
): ViewProfile | null {
  if (normalizeRole(realRole ?? "") !== "admin") return null;
  return getViewProfile(cookieValue);
}
