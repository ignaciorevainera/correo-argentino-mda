// src/lib/helpdeskAccess.ts
import { normalizeRole } from "./rbac";

export const MDA_TI_HELPDESK = "TI_GSM_MDA TI";
export const COORD_HELPDESK = "TI_GSM_Mesa de Coord";

export const ALLOWED_HELPDESK_NAMES: string[] = [
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
];

// Mesas con secciones propias donde los agentes "figuran" (cronograma, cubics,
// calidad, AGS). Solo los usuarios de estas mesas tienen participaciones
// editables. Coordinación (y futuras mesas sin secciones participativas) no.
export const PARTICIPATION_HELPDESK_NAMES: string[] = [MDA_TI_HELPDESK];

export function mesaHasParticipaciones(
  helpdeskName: string | null | undefined,
): boolean {
  const name = (helpdeskName ?? "").trim().replace(/\s+/g, " ");
  return !!name && PARTICIPATION_HELPDESK_NAMES.includes(name);
}

// Mapea el row de usuarios+mesas del middleware a la sesión. Fail-closed:
// solo una mesa ACTIVA con id y nombre confiables cuenta como asignada;
// cualquier otro caso (mesa inactiva, borrada, join vacío, nombre vacío)
// devuelve "sin mesa" (el usuario cae al default restrictivo).
export function resolveSessionMesa(
  dbUser: {
    helpdeskId: number | null;
    helpdeskName: string | null;
    mesaActive: boolean | null | undefined;
  },
): { helpdeskId: number | null; helpdeskName: string | null } {
  const active =
    dbUser.helpdeskId != null &&
    dbUser.mesaActive === true &&
    !!dbUser.helpdeskName?.trim();
  return active
    ? { helpdeskId: dbUser.helpdeskId, helpdeskName: dbUser.helpdeskName }
    : { helpdeskId: null, helpdeskName: null };
}

const SUPERIOR_ROLES = new Set(["team_leader", "supervisor"]);

export function isSuperiorRole(role: string): boolean {
  return SUPERIOR_ROLES.has(normalizeRole(role));
}

// ÚNICA fuente de verdad de visibilidad por mesa. Sincrónica a propósito:
// middleware, sidebar y dashboard la comparten (sin cache, sin DB).
export function isSectionVisibleSync(
  helpdeskName: string | null | undefined,
  role: string,
  href: string,
): boolean {
  const normalizedRole = normalizeRole(role);
  const lower = href.toLowerCase().replace(/\/+$/, "");
  const mesa = (helpdeskName ?? "").trim().replace(/\s+/g, " ");

  // Politica: el rol admin siempre tiene acceso a todo (no revocable).
  if (normalizedRole === "admin") return true;

  const isMdaTi = mesa === MDA_TI_HELPDESK;

  // Mesa de Coord (y cualquier mesa no-MDA-TI o sin asignar) ve solo páginas comunes.
  if (!isMdaTi) {
    const coordBlocked = [
      "/supervision",
      "/admin",
      "/inventario-terminales/cubics",
    ];
    const blocked =
      coordBlocked.some((s) => lower === s || lower.startsWith(`${s}/`)) ||
      lower.startsWith("/api/cronograma") ||
      lower.startsWith("/api/disponibilidad") ||
      lower.startsWith("/api/asistencia") ||
      lower.startsWith("/api/calidad") ||
      lower.startsWith("/api/export") ||
      lower.startsWith("/api/admin");
    return !blocked;
  }

  // === MDA TI ===
  if (lower.startsWith("/inventario-terminales/cubics")) return true;

  if (lower.startsWith("/supervision")) {
    if (lower === "/supervision" || lower === "/supervision/") return true;
    if (lower.startsWith("/supervision/cronograma")) return true;
    if (lower.startsWith("/supervision/calidad-operadores")) return true;
    if (lower.startsWith("/supervision/asistencia")) {
      return isSuperiorRole(normalizedRole);
    }
    if (lower.startsWith("/supervision/asignacion-autogestiones")) {
      return true;
    }
    return isSuperiorRole(normalizedRole);
  }

  if (lower.startsWith("/api/asistencia")) return isSuperiorRole(normalizedRole);
  if (lower.startsWith("/api/export")) return isSuperiorRole(normalizedRole);

  return true;
}
