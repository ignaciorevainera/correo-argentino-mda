import { db } from "@db/index";
import { auditLogs } from "@db/schema";

/**
 * Registra una acción administrativa en el sistema de auditoría.
 * Captura y maneja cualquier error para no interrumpir el flujo principal.
 *
 * @param username El nombre de usuario que realiza la acción
 * @param action Descripción de la acción realizada
 */
export async function logAdminFromAstro(
  locals: App.Locals,
  message: string,
): Promise<void> {
  const username = locals.user?.username || "Sistema";
  await logAdminAction(username, message);
}

export async function logAdminActionStructured(
  username: string,
  action: string,
  entityType: string,
  entityId: number,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    await db.insert(auditLogs).values({
      username,
      action,
      timestamp,
      entityType,
      entityId,
      beforeState,
      afterState,
    });
  } catch (error) {
    console.error("[AuditLogger] Fallo al registrar la acción estructurada:", error);
  }
}

export async function logAdminAction(
  username: string,
  action: string,
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    await db.insert(auditLogs).values({
      username,
      action,
      timestamp,
    });
  } catch (error) {
    console.error("[AuditLogger] Fallo al registrar la acción:", error);
  }
}
