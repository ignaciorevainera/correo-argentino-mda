import { normalizeRole } from "./rbac";

export const MDA_TI_HELPDESK = "TI_GSM_MDA TI";
export const COORD_HELPDESK = "TI_GSM_Mesa de Coord";
export const DEFAULT_HELPDESK = "Default";

export const ALLOWED_HELPDESK_NAMES: string[] = [
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
];

const SUPERVISION_SECTIONS = [
  "/supervision",
  "/supervision/cronograma",
  "/supervision/calidad-operadores",
  "/supervision/asignacion-autogestiones",
  "/supervision/asistencia",
];

const SUPERIOR_ROLES = new Set(["team_leader", "supervisor"]);

export function isSuperiorRole(role: string): boolean {
  return SUPERIOR_ROLES.has(role);
}

export function isSupervisionSection(href: string): boolean {
  const lower = href.toLowerCase().replace(/\/$/, "");
  return SUPERVISION_SECTIONS.some(
    (s) => lower === s || lower.startsWith(`${s}/`),
  );
}

export function isSectionVisible(
  helpdeskName: string | null | undefined,
  role: string,
  href: string,
): boolean {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "admin") return true;

  if (isSupervisionSection(href)) {
    return helpdeskName === MDA_TI_HELPDESK && isSuperiorRole(normalizedRole);
  }

  return true;
}
