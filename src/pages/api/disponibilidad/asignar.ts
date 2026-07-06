import type { APIRoute } from "astro";
import { asignarSiguienteAutogestion, ensureHasLock, resetAssignmentLock } from "@lib/disponibilidad";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const POST: APIRoute = async ({ locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  const lockCheck = await ensureHasLock(locals);
  if (!lockCheck.ok) return lockCheck.response;

  try {
    const assignedBy = locals.user?.username || "Sistema";
    const result = await asignarSiguienteAutogestion(assignedBy);
    if (result.success) {
      await resetAssignmentLock();
    }
    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error: any) {
    console.error("POST /api/disponibilidad/asignar Error:", error);
    return jsonResponse({ success: false, error: sanitizeError(error) }, 500);
  }
};
