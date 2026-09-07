export type Role =
  "admin" | "supervisor" | "team_leader" | "referent" | "agent";

export const ROLE_HIERARCHY: Record<Role, number> = {
  agent: 1,
  referent: 2,
  team_leader: 3,
  supervisor: 4,
  admin: 5,
};

export const CANONICAL_ROLES: readonly Role[] = [
  "admin",
  "supervisor",
  "team_leader",
  "referent",
  "agent",
] as const;

const CANONICAL_ROLE_SET = new Set<string>(CANONICAL_ROLES);

export function isValidRole(role: string): role is Role {
  return typeof role === "string" && CANONICAL_ROLE_SET.has(role);
}

export function normalizeRole(role: string): Role {
  const clean = role.toLowerCase().replace(/[-_]/g, " ").trim();
  if (clean === "admin") return "admin";
  if (clean === "supervisor") return "supervisor";
  if (
    clean === "team leader" ||
    clean === "team_leader" ||
    clean === "team-leader"
  )
    return "team_leader";
  if (clean === "referent" || clean === "referente") return "referent";
  return "agent";
}

export interface RoutePermission {
  path: string;
  roles: Role[];
}

// Every role, ordered by hierarchy. Used for whitelist entries whose access
// was "everyone" under the old default-allow behavior.
const ALL_ROLES: Role[] = [
  "agent",
  "referent",
  "team_leader",
  "supervisor",
  "admin",
];

export const routePermissions: RoutePermission[] = [
  { path: "/admin/usuarios-sin-ubicacion", roles: ["admin"] },
  { path: "/admin/usuarios", roles: ["admin"] },
  { path: "/admin/auditoria", roles: ["admin"] },
  { path: "/admin/feedback", roles: ["admin"] },
  { path: "/admin/permisos", roles: ["admin"] },
  {
    path: "/admin/invgate/ubicaciones",
    roles: ["admin", "supervisor", "team_leader"],
  },
  { path: "/admin", roles: ["admin", "supervisor", "team_leader"] },
  {
    path: "/supervision/asistencia",
    roles: ["admin", "supervisor", "team_leader"],
  },
  {
    path: "/supervision/cronograma",
    roles: ["admin", "supervisor", "team_leader", "referent", "agent"],
  },
  {
    path: "/supervision/calidad-operadores",
    roles: ["admin", "supervisor", "team_leader", "referent", "agent"],
  },
  {
    path: "/supervision/asignacion-autogestiones",
    roles: ["admin", "supervisor", "team_leader", "referent", "agent"],
  },
  {
    path: "/supervision",
    roles: ["admin", "supervisor", "team_leader", "referent", "agent"],
  },
  { path: "/mesas-de-ayuda/create", roles: ["admin", "supervisor"] },
  { path: "/mesas-de-ayuda/edit", roles: ["admin", "supervisor"] },
  { path: "/mesas-de-ayuda/asignar", roles: ["admin", "supervisor"] },
  { path: "/oficinas/create", roles: ["admin", "supervisor"] },
  { path: "/oficinas/edit", roles: ["admin", "supervisor"] },
  {
    path: "/inventario-terminales/cubics/create",
    roles: ["admin", "supervisor"],
  },
  {
    path: "/inventario-terminales/cubics/edit",
    roles: ["admin", "supervisor"],
  },

  // Default-deny whitelist: every route group that exists under src/pages
  // today is listed explicitly below with the access it had under the old
  // default-allow behavior. Any NEW path is denied by default and must be
  // added here. Do NOT add a bare "/" entry — the longest-prefix `startsWith`
  // matching would make it a catch-all that defeats default-deny.
  { path: "/404", roles: ALL_ROLES },
  { path: "/login", roles: ALL_ROLES },
  { path: "/logout", roles: ALL_ROLES },
  // Astro Actions (/_actions/*): los checks de rol viven dentro de cada
  // action (context.locals.user); el middleware solo exige sesion valida.
  { path: "/_actions", roles: ALL_ROLES },
  { path: "/profile", roles: ALL_ROLES },
  { path: "/buscador-usuarios", roles: ALL_ROLES },
  { path: "/contactos", roles: ALL_ROLES },
  { path: "/generador-firmas", roles: ALL_ROLES },
  { path: "/inventario-terminales", roles: ALL_ROLES },
  { path: "/mesas-de-ayuda", roles: ALL_ROLES },
  { path: "/oficinas", roles: ALL_ROLES },
  { path: "/recursos", roles: ALL_ROLES },
  { path: "/titulos", roles: ALL_ROLES },
  { path: "/base-conocimiento", roles: ALL_ROLES },
  { path: "/api/admin", roles: ALL_ROLES },
  { path: "/api/aplicativos", roles: ALL_ROLES },
  { path: "/api/asistencia", roles: ALL_ROLES },
  { path: "/api/cronograma", roles: ALL_ROLES },
  { path: "/api/disponibilidad", roles: ALL_ROLES },
  { path: "/api/download", roles: ALL_ROLES },
  { path: "/api/export", roles: ALL_ROLES },
  { path: "/api/icons", roles: ALL_ROLES },
  { path: "/api/invgate", roles: ALL_ROLES },
  { path: "/api/offices", roles: ALL_ROLES },
  { path: "/api/soportes", roles: ALL_ROLES },
  { path: "/api/support-guides", roles: ALL_ROLES },
  { path: "/api/terminals", roles: ALL_ROLES },
  { path: "/api/titulos", roles: ALL_ROLES },
  { path: "/api/usuarios", roles: ALL_ROLES },
];

export function hasPermission(path: string, userRole: string): boolean {
  // Politica: el rol admin siempre tiene acceso a todo (no revocable).
  if (normalizeRole(userRole) === "admin") return true;
  const role = normalizeRole(userRole);
  const normalizedPath = path.toLowerCase();

  const matchedRoute = routePermissions
    .filter((route) => normalizedPath.startsWith(route.path.toLowerCase()))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const userRank = ROLE_HIERARCHY[role];

  // The home page is public. It cannot be expressed as a prefix entry because
  // "/" matches every path under startsWith semantics.
  if (normalizedPath === "/") return true;

  // Default deny: unknown paths must be explicitly whitelisted in
  // routePermissions.
  if (!matchedRoute) {
    return false;
  }

  return matchedRoute.roles.some((allowedRole) => {
    const allowedRank = ROLE_HIERARCHY[allowedRole];
    return userRank >= allowedRank;
  });
}

export interface ModulePermission {
  canRead: boolean;
  canWrite: boolean;
  canViewAll: boolean; // Ver datos de todos los operadores
  canViewComments: boolean; // Ver comentarios detallados en Cronograma
  canViewTotals: boolean; // Ver columnas totales P/HO/L
}

export function getModulePermissions(
  moduleName: string,
  userRole: string,
): ModulePermission {
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
  } else if (moduleName === "usuarios") {
    // Solo lectura por defecto, escritura solo para admin
    perm.canRead = true;
    perm.canWrite = rank >= ROLE_HIERARCHY.admin;
  } else if (moduleName === "permisos") {
    perm.canRead = rank >= ROLE_HIERARCHY.admin;
    perm.canWrite = rank >= ROLE_HIERARCHY.admin;
  }

  return perm;
}

