import type { APIRoute } from "astro";
import { asignarSiguienteAutogestion } from "@lib/disponibilidad";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";

export const POST: APIRoute = async ({ locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  try {
    const assignedBy = locals.user?.username || "Sistema";
    const result = await asignarSiguienteAutogestion(assignedBy);
    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error: any) {
    console.error("POST /api/disponibilidad/asignar Error:", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
};
