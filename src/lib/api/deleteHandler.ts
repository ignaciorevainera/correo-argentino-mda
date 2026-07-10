import type { APIRoute } from "astro";
import { getBaseNoSlash } from "@lib/baseUrl";
import { logAdminFromAstro } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export interface DeleteHandlerConfig {
  entityName: string;
  redirectPath: string;
  requiredFeature?: string;
  unauthorizedMessage?: string;
  invalidIdMessage?: string;
  successMessage?: (deleted: Record<string, unknown> | null) => string;
  notFoundMessage?: string;
  errorMessage?: (error: unknown) => string;
  logMessage?: (deleted: Record<string, unknown> | null) => string;
  returnJsonOnInvalidId?: boolean;
  beforeDelete?: (context: { id: number }) => Promise<void> | void;
  afterDelete?: (context: { id: number; deleted: Record<string, unknown> | null }) => Promise<void> | void;
  performDelete: (id: number) => Promise<Record<string, unknown> | null>;
}

export function createDeleteHandler(config: DeleteHandlerConfig): APIRoute {
  return async ({ params, redirect, locals }) => {
    const rawId = params.id;
    const id = Number(rawId);
    const isInvalid = !rawId || isNaN(id) || id <= 0;
    const invalidIdMsg = config.invalidIdMessage ?? `ID de ${config.entityName} no proporcionado`;

    if (isInvalid) {
      if (config.returnJsonOnInvalidId) {
        return new Response(invalidIdMsg, { status: 400 });
      }
      return redirect(
        `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(invalidIdMsg)}&toast_type=error`
      );
    }

    if (config.requiredFeature) {
      const user = locals.user;
      if (!user || !isAllowed(config.requiredFeature, user.role)) {
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(
            config.unauthorizedMessage ?? "No autorizado"
          )}&toast_type=error`
        );
      }
    }

    try {
      if (config.beforeDelete) {
        await config.beforeDelete({ id });
      }

      const deleted = await config.performDelete(id);

      if (config.afterDelete) {
        await config.afterDelete({ id, deleted });
      }

      const logMsg = config.logMessage
        ? config.logMessage(deleted)
        : `Eliminó el ${config.entityName} "${id}"`;
      await logAdminFromAstro(locals, logMsg);

      if (deleted) {
        const successMsg = config.successMessage
          ? config.successMessage(deleted)
          : `${config.entityName.charAt(0).toUpperCase() + config.entityName.slice(1)} eliminado con éxito.`;
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(successMsg)}&toast_type=success`
        );
      } else {
        const notFoundMsg = config.notFoundMessage ?? `El ${config.entityName} no existe.`;
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(notFoundMsg)}&toast_type=error`
        );
      }
    } catch (error) {
      console.error(`[deleteHandler] Error al eliminar ${config.entityName}:`, error);
      const errorMsg = config.errorMessage
        ? config.errorMessage(error)
        : `Error al eliminar el ${config.entityName}.`;
      return redirect(
        `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(errorMsg)}&toast_type=error`
      );
    }
  };
}
