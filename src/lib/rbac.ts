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

/**
 * Sesión iniciada: el middleware asigna `id: 0` al usuario anónimo, así que
 * `id !== 0` es el marcador de sesión activa.
 */
export function isLoggedIn(user: { id: number } | null | undefined): boolean {
  return Boolean(user && user.id !== 0);
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

// Acceso a Base de conocimiento: SOLO admin por el momento (medida temporal,
// decidida 2026-09). Para reabrir a la mesa, reemplazar por los roles previos
// (ver/leer: todos; administrar: ["team_leader","supervisor","admin"]).
// Ver docs/CONTEXT.md (sección Base de conocimiento).
export const KB_ACCESS_ROLES: readonly Role[] = Object.freeze(["admin"]);

export const routePermissions: RoutePermission[] = [
  { path: "/admin/usuarios-sin-ubicacion", roles: ["admin"] },
  { path: "/admin/usuarios", roles: ["admin"] },
  { path: "/admin/usuarios/mesas-de-ayuda", roles: ["admin"] },
  { path: "/admin/auditoria", roles: ["admin"] },
  { path: "/admin/automatizaciones/etapas", roles: ["admin"] },
  { path: "/admin/feedback", roles: ["admin"] },
  { path: "/admin/permisos", roles: ["admin"] },
  { path: "/admin/papelera", roles: ["admin"] },
  { path: "/admin/documentacion", roles: ["admin"] },
  { path: "/admin/oficinas/edificios", roles: ["admin"] },
  {
    path: "/admin/calidad/calibracion",
    roles: ["admin", "supervisor"],
  },
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
    path: "/supervision/asistencia/operador",
    roles: ["admin", "supervisor", "team_leader"],
  },
  {
    path: "/supervision/cronograma",
    roles: ["admin", "supervisor", "team_leader", "referent", "agent"],
  },
  {
    path: "/supervision/calidad-operadores/nueva",
    roles: ["admin", "supervisor", "team_leader", "referent"],
  },
  {
    path: "/supervision/calidad-operadores",
    roles: ["admin", "supervisor", "team_leader", "referent", "agent"],
  },
  {
    path: "/supervision/autogestiones-metricas",
    roles: ["admin", "supervisor", "team_leader", "referent"],
  },
  {
    path: "/supervision/asignacion-autogestiones",
    roles: ["admin", "supervisor", "team_leader", "referent"],
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
  { path: "/oficinas/estadisticas", roles: ["admin", "supervisor"] },
  { path: "/oficinas/estructura", roles: ["admin", "supervisor"] },
  { path: "/base-conocimiento/categorias", roles: [...KB_ACCESS_ROLES] },
  { path: "/base-conocimiento/create", roles: [...KB_ACCESS_ROLES] },
  { path: "/base-conocimiento/edit", roles: [...KB_ACCESS_ROLES] },
  {
    path: "/inventario-terminales/cubics/create",
    roles: ["admin", "supervisor"],
  },
  {
    path: "/inventario-terminales/cubics/edit",
    roles: ["admin", "supervisor"],
  },
  // Estadísticas del Inventario de Terminales: por ahora solo admin (el endpoint
  // bajo /api/terminals queda en la whitelist y devuelve 403 JSON vía
  // requireReadAccess("inventario"), mismo patrón que /api/oficinas).
  { path: "/inventario-terminales/estadisticas", roles: ["admin"] },
  {
    path: "/reportes",
    roles: ["admin"],
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
  { path: "/changelog", roles: ALL_ROLES },
  { path: "/profile", roles: ALL_ROLES },
  { path: "/buscador-usuarios", roles: ALL_ROLES },
  { path: "/contactos", roles: ALL_ROLES },
  { path: "/generador-firmas", roles: ALL_ROLES },
  { path: "/inventario-terminales", roles: ALL_ROLES },
  { path: "/mesas-de-ayuda", roles: ALL_ROLES },
  { path: "/oficinas", roles: ALL_ROLES },
  { path: "/recursos", roles: ALL_ROLES },
  { path: "/titulos", roles: ALL_ROLES },
  // Monitoreo de automatizaciones: lectura para todos los logueados. La
  // escritura (cerrar/reabrir/editar datos) se decide por módulo en
  // getModulePermissions (supervisor+), no por esta whitelist.
  { path: "/automatizaciones", roles: ALL_ROLES },
  { path: "/automatizaciones/metricas", roles: ALL_ROLES },
  { path: "/base-conocimiento", roles: [...KB_ACCESS_ROLES] },
  { path: "/api/admin", roles: ALL_ROLES },
  { path: "/api/aplicativos", roles: ALL_ROLES },
  { path: "/api/asistencia", roles: ALL_ROLES },
  { path: "/api/automatizaciones", roles: ALL_ROLES },
  // Toggle de automatizaciones AGS: el gate real (referent+) vive en el endpoint
  // vía requireWriteAccess("asignacion_ag"), igual que /api/disponibilidad.
  { path: "/api/autogestion", roles: ALL_ROLES },
  { path: "/api/ags", roles: ALL_ROLES },
  { path: "/api/home", roles: ALL_ROLES },
  // El gate real de cada endpoint de calidad vive en requireRead/WriteAccess.
  { path: "/api/calidad", roles: ALL_ROLES },
  { path: "/api/credentials", roles: ALL_ROLES },
  { path: "/api/cronograma", roles: ALL_ROLES },
  { path: "/api/disponibilidad", roles: ALL_ROLES },
  { path: "/api/download", roles: ALL_ROLES },
  { path: "/api/export", roles: ALL_ROLES },
  { path: "/api/icons", roles: ALL_ROLES },
  { path: "/api/invgate", roles: ALL_ROLES },
  { path: "/api/kb/upload", roles: [...KB_ACCESS_ROLES] },
  { path: "/api/kb/images", roles: [...KB_ACCESS_ROLES] },
  { path: "/api/offices", roles: ALL_ROLES },
  // Reportería de oficinas: la whitelist deja pasar la request y el handler
  // aplica requireReadAccess("oficinas") -> supervisor+ (mismo patrón que
  // /api/admin/usuarios). Así el agente recibe 403 JSON, no un redirect.
  { path: "/api/oficinas", roles: ALL_ROLES },
  { path: "/api/profile", roles: ALL_ROLES },
  { path: "/api/reportes", roles: ALL_ROLES },
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
    // Leen: referente, team_leader, supervisor, admin
    perm.canRead = rank >= ROLE_HIERARCHY.referent;
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
  } else if (moduleName === "base-conocimiento") {
    // Temporal (2026-09): read y write comparten KB_ACCESS_ROLES mientras la
    // sección está restringida. Al revertir a un esquema read≠write, restaurar
    // la separación previa (read todos; write team_leader+) acá.
    // admin siempre permitido (no revocable), igual que el short-circuit de
    // hasPermission: si se sacara de KB_ACCESS_ROLES, no debe quedar locked out.
    // Ver docs/CONTEXT.md (sección Base de conocimiento).
    const canAccessKb = role === "admin" || KB_ACCESS_ROLES.includes(role);
    perm.canRead = canAccessKb;
    perm.canWrite = canAccessKb;
  } else if (moduleName === "usuarios") {
    // Solo admin lee/escribe: `ad-groups-licenses` usa este módulo y expone
    // datos de AD. Los endpoints que alimentan `/buscador-usuarios` (ALL_ROLES)
    // — search/status/net-user/invgate-user — NO usan este módulo: exigen solo
    // sesión vía `requireSession`, porque la página es para todo rol logueado.
    perm.canRead = rank >= ROLE_HIERARCHY.admin;
    perm.canWrite = rank >= ROLE_HIERARCHY.admin;
  } else if (moduleName === "permisos") {
    perm.canRead = rank >= ROLE_HIERARCHY.admin;
    perm.canWrite = rank >= ROLE_HIERARCHY.admin;
  } else if (moduleName === "automatizaciones") {
    // Monitoreo de automatizaciones InvGate: lectura para todos los roles
    // logueados. Escritura (cerrar/reabrir localmente y editar datos manuales)
    // para supervisor+, que es la política de cierre desde el portal.
    perm.canRead = true;
    perm.canWrite = rank >= ROLE_HIERARCHY.supervisor;
  } else if (moduleName === "inventario") {
    // Estadísticas del Inventario de Terminales: por ahora solo admin (lectura).
    perm.canRead = rank >= ROLE_HIERARCHY.admin;
  } else if (moduleName === "oficinas") {
    // Reportería de oficinas: lectura supervisor+ (gerencia). La escritura del
    // CRUD de oficinas se decide por routePermissions, no por este módulo.
    perm.canRead = rank >= ROLE_HIERARCHY.supervisor;
    perm.canWrite = false;
  } else if (moduleName === "reportes") {
    perm.canRead = rank >= ROLE_HIERARCHY.admin;
    perm.canWrite = rank >= ROLE_HIERARCHY.admin;
  }

  return perm;
}
