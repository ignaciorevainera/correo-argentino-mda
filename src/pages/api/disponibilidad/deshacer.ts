import type { APIRoute } from "astro";
import { deshacerAsignacion, ensureHasLock, resetAssignmentLock } from "@lib/disponibilidad";
import { normalizeRole } from "@lib/rbac";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";

export const POST: APIRoute = async ({ locals }) => {
  const role = normalizeRole(locals.user?.role);
  if (role === "agent") {
    return jsonError("No autorizado", 403);
  }

  const lockCheck = await ensureHasLock(locals);
  if (!lockCheck.ok) return lockCheck.response;

  try {
    const res = await deshacerAsignacion();
    if (res.success) {
      await resetAssignmentLock();
      return jsonResponse({ success: true, agentName: res.agentName }, 200);
    }
    return jsonResponse({ error: res.error }, 400);
  } catch (e: any) {
    return jsonResponse({ error: sanitizeError(e) || "Error al deshacer la asignación" }, 500);
  }
};
