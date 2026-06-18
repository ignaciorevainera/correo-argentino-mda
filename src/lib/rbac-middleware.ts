import { getModulePermissions, normalizeRole, type Role } from "./rbac";

/**
 * Verifica si el usuario tiene permiso de escritura para un módulo determinado.
 * Si no está autorizado, retorna un objeto Response (401 o 403) listo para ser devuelto por el API Route.
 * Si está autorizado, retorna null.
 */
export function requireWriteAccess(locals: App.Locals, moduleName: string): Response | null {
  const user = locals.user;
  if (!user || user.id === 0) {
    return new Response(JSON.stringify({ error: "Sesión no iniciada" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const perms = getModulePermissions(moduleName, user.role);
  if (!perms.canWrite) {
    return new Response(JSON.stringify({ error: "Acceso denegado (requiere permisos de escritura)" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

/**
 * Verifica si el usuario tiene permiso de lectura para un módulo determinado.
 * Si no está autorizado, retorna un objeto Response (401 o 403) listo para ser devuelto por el API Route.
 * Si está autorizado, retorna null.
 */
export function requireReadAccess(locals: App.Locals, moduleName: string): Response | null {
  const user = locals.user;
  if (!user || user.id === 0) {
    return new Response(JSON.stringify({ error: "Sesión no iniciada" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const perms = getModulePermissions(moduleName, user.role);
  if (!perms.canRead) {
    return new Response(JSON.stringify({ error: "Acceso denegado (requiere permisos de lectura)" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
