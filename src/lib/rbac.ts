export type Role = "admin" | "supervisor" | "team_leader" | "referent" | "agent";

export const ROLE_HIERARCHY: Record<Role, number> = {
  agent: 1,
  referent: 2,
  team_leader: 3,
  supervisor: 4,
  admin: 5,
};

export function normalizeRole(role: string): Role {
  const clean = role.toLowerCase().replace(/[-_]/g, " ").trim();
  if (clean === "admin") return "admin";
  if (clean === "supervisor") return "supervisor";
  if (clean === "team leader" || clean === "team_leader" || clean === "team-leader") return "team_leader";
  if (clean === "referent" || clean === "referente") return "referent";
  return "agent";
}

export interface RoutePermission {
  path: string;
  roles: Role[];
}

export const routePermissions: RoutePermission[] = [
  { path: "/admin/usuarios", roles: ["admin"] },
  { path: "/admin/auditoria", roles: ["admin"] },
  { path: "/admin/invgate/ubicaciones", roles: ["admin"] },
  { path: "/admin", roles: ["admin", "supervisor", "team_leader"] },
  { path: "/supervision/asistencia", roles: ["admin", "supervisor", "team_leader"] },
  { path: "/supervision/cronograma", roles: ["admin", "supervisor", "team_leader", "referent", "agent"] },
  { path: "/supervision/calidad-operadores", roles: ["admin", "supervisor", "team_leader", "referent", "agent"] },
  { path: "/supervision/asignacion-autogestiones", roles: ["admin", "supervisor", "team_leader", "referent", "agent"] },
  { path: "/supervision", roles: ["admin", "supervisor", "team_leader", "referent", "agent"] },
  { path: "/soportes/create", roles: ["admin", "supervisor"] },
  { path: "/soportes/edit", roles: ["admin", "supervisor"] },
  { path: "/oficinas/create", roles: ["admin", "supervisor"] },
  { path: "/oficinas/edit", roles: ["admin", "supervisor"] },
  { path: "/inventario-terminales/cubics/create", roles: ["admin", "supervisor"] },
  { path: "/inventario-terminales/cubics/edit", roles: ["admin", "supervisor"] },
];

export function hasPermission(path: string, userRole: string): boolean {
  const role = normalizeRole(userRole);
  const normalizedPath = path.toLowerCase();

  const matchedRoute = routePermissions
    .filter(route => normalizedPath.startsWith(route.path.toLowerCase()))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!matchedRoute) {
    return true;
  }

  const userRank = ROLE_HIERARCHY[role] || 0;
  return matchedRoute.roles.some(allowedRole => {
    const allowedRank = ROLE_HIERARCHY[allowedRole];
    return userRank >= allowedRank;
  });
}

export interface ModulePermission {
  canRead: boolean;
  canWrite: boolean;
  canViewAll: boolean;      // Ver datos de todos los operadores
  canViewComments: boolean; // Ver comentarios detallados en Cronograma
  canViewTotals: boolean;   // Ver columnas totales P/HO/L
}

export function getModulePermissions(moduleName: string, userRole: string): ModulePermission {
  const role = normalizeRole(userRole);
  const rank = ROLE_HIERARCHY[role] || 0;

  // Default block
  const perm: ModulePermission = {
    canRead: false,
    canWrite: false,
    canViewAll: true,
    canViewComments: true,
    canViewTotals: true,
  };

  if (moduleName === "cronograma") {
    // Todos leen
    perm.canRead = true;
    // Escriben: admin, supervisor, team_leader
    perm.canWrite = rank >= ROLE_HIERARCHY.team_leader;
    // Ocultar totales y comentarios a operador (agent) y referente
    if (rank < ROLE_HIERARCHY.team_leader) {
      perm.canViewComments = false;
      perm.canViewTotals = false;
    }
  } else if (moduleName === "asignacion_ag") {
    // Todos leen
    perm.canRead = true;
    // Escriben: todos excepto agent
    perm.canWrite = rank >= ROLE_HIERARCHY.referent;
  } else if (moduleName === "calidad") {
    // Todos leen
    perm.canRead = true;
    // Escriben: todos excepto agent
    perm.canWrite = rank >= ROLE_HIERARCHY.referent;
    // agent solo ve su propia calidad
    perm.canViewAll = rank >= ROLE_HIERARCHY.referent;
  } else if (moduleName === "asistencia") {
    // Leen/escriben: admin, supervisor, team_leader
    perm.canRead = rank >= ROLE_HIERARCHY.team_leader;
    perm.canWrite = rank >= ROLE_HIERARCHY.team_leader;
  } else if (moduleName === "titulos") {
    // Leen: todos / Escriben: admin, supervisor, team_leader
    perm.canRead = true;
    perm.canWrite = rank >= ROLE_HIERARCHY.team_leader;
  }

  return perm;
}


