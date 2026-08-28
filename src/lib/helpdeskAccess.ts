import { normalizeRole } from "./rbac";
import { hasRouteAccess } from "./permissions/resolve";

export const MDA_TI_HELPDESK = "TI_GSM_MDA TI";
export const COORD_HELPDESK = "TI_GSM_Mesa de Coord";

export const ALLOWED_HELPDESK_NAMES: string[] = [
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
];

const SUPERIOR_ROLES = new Set(["team_leader", "supervisor"]);

export function isSuperiorRole(role: string): boolean {
  return SUPERIOR_ROLES.has(normalizeRole(role));
}

export function isSectionVisibleSync(
  helpdeskName: string | null | undefined,
  role: string,
  href: string,
): boolean {
  const normalizedRole = normalizeRole(role);
  const lower = href.toLowerCase().replace(/\/$/, "");

  // Admin powers exist only for MDA TI; any other mesa (incl. Coord) has no admin.
  if (normalizedRole === "admin" && helpdeskName === MDA_TI_HELPDESK) {
    return true;
  }

  const isMdaTi = helpdeskName === MDA_TI_HELPDESK;

  // Mesa de Coord (and any non-MDA-TI / unassigned user) sees only common pages.
  if (!isMdaTi) {
    const coordBlocked = [
      "/supervision",
      "/admin",
      "/inventario-terminales/cubics",
    ];
    const blocked =
      coordBlocked.some(
        (s) => lower === s || lower.startsWith(`${s}/`),
      ) ||
      lower.startsWith("/api/cronograma") ||
      lower.startsWith("/api/disponibilidad") ||
      lower.startsWith("/api/asistencia") ||
      lower.startsWith("/api/calidad") ||
      lower.startsWith("/api/export") ||
      lower.startsWith("/api/admin");
    return !blocked;
  }

  // === MDA TI ===
  // Cúbics tab is exclusive to MDA TI.
  if (lower.startsWith("/inventario-terminales/cubics")) return true;

  if (lower.startsWith("/supervision")) {
    if (lower === "/supervision" || lower === "/supervision/") return true;
    if (lower.startsWith("/supervision/cronograma")) return true;
    if (lower.startsWith("/supervision/calidad-operadores")) return true;
    if (lower.startsWith("/supervision/asistencia")) {
      return isSuperiorRole(normalizedRole);
    }
    if (lower.startsWith("/supervision/asignacion-autogestiones")) {
      // AGS visible to all MDA TI roles (write still gated by getModulePermissions).
      return true;
    }
    // Any other supervision subpath requires a superior role.
    return isSuperiorRole(normalizedRole);
  }

  if (lower.startsWith("/api/asistencia")) return isSuperiorRole(normalizedRole);
  if (lower.startsWith("/api/export")) return isSuperiorRole(normalizedRole);

  return true;
}

// Async wrapper: sync logic is authoritative for HARD blocks (non-MDA-TI
// mesa boundaries, API path gating). DB overrides can only further DENY a
// managed route that sync would otherwise allow.
export async function isSectionVisible(
  helpdeskName: string | null | undefined,
  role: string,
  href: string,
  mesaId: number | null = null,
): Promise<boolean> {
  const syncAllowed = isSectionVisibleSync(helpdeskName, role, href);
  if (!syncAllowed) return false; // hard block preserved
  try {
    return await hasRouteAccess(href, role, mesaId);
  } catch {
    // On cache/resolver error, fail open conservatively (sync already allowed).
    return true;
  }
}
