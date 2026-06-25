import { normalizeRole, ROLE_HIERARCHY, type Role } from "@lib/rbac";

export { type Role, normalizeRole };

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  team_leader: "Team Leader",
  referent: "Referente",
  agent: "Agente",
};

export const ROLE_VARIANTS: Record<Role, string> = {
  admin: "badge-error",
  supervisor: "badge-warning",
  team_leader: "badge-info",
  referent: "badge-success",
  agent: "badge-ghost",
};

export function can(userRole: string, minimumRole: Role): boolean {
  const rank = ROLE_HIERARCHY[normalizeRole(userRole)] || 0;
  return rank >= ROLE_HIERARCHY[minimumRole];
}

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "agent", label: "Agente" },
  { value: "referent", label: "Referente" },
  { value: "team_leader", label: "Team Leader" },
  { value: "supervisor", label: "Supervisor" },
  { value: "admin", label: "Admin" },
];
