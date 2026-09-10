import { getModulePermissions, normalizeRole, type Role } from "./rbac";
import { jsonError } from "@lib/apiResponse";

/**
 * Verifica si el usuario tiene permiso de escritura para un módulo determinado.
 * Si no está autorizado, retorna un objeto Response (401 o 403) listo para ser devuelto por el API Route.
 * Si está autorizado, retorna null.
 */
export function requireWriteAccess(
  locals: App.Locals,
  moduleName: string,
): Response | null {
  const user = locals.user;
  if (!user || user.id === 0) {
    return jsonError("Sesión no iniciada", 401);
  }

  const perms = getModulePermissions(moduleName, user.role);
  if (!perms.canWrite) {
    return jsonError("Acceso denegado (requiere permisos de escritura)", 403);
  }

  return null;
}

/**
 * Verifica si el usuario tiene permiso de lectura para un módulo determinado.
 * Si no está autorizado, retorna un objeto Response (401 o 403) listo para ser devuelto por el API Route.
 * Si está autorizado, retorna null.
 */
export function requireReadAccess(
  locals: App.Locals,
  moduleName: string,
): Response | null {
  const user = locals.user;
  if (!user || user.id === 0) {
    return jsonError("Sesión no iniciada", 401);
  }

  const perms = getModulePermissions(moduleName, user.role);
  if (!perms.canRead) {
    return jsonError("Acceso denegado (requiere permisos de lectura)", 403);
  }

  return null;
}
