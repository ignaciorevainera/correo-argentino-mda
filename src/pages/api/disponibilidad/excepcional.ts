import type { APIRoute } from "astro";
import { marcarEstadoExcepcional, limpiarEstadoExcepcional, ensureHasLock } from "@lib/disponibilidad";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  const lockCheck = await ensureHasLock(locals);
  if (!lockCheck.ok) return lockCheck.response;

  try {
    const { agentId, tipo, motivo, tiempoExtra } = await request.json();

    if (!agentId || typeof agentId !== "number") {
      return jsonResponse({ success: false, error: "ID de agente inválido" }, 400);
    }

    if (!tipo || typeof tipo !== "string") {
      return jsonResponse({ success: false, error: "Tipo de excepción inválido" }, 400);
    }

    const result = await marcarEstadoExcepcional(agentId, tipo, motivo, tiempoExtra);

    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error: any) {
    console.error("POST /api/disponibilidad/excepcional Error:", error);
    return jsonResponse({ success: false, error: sanitizeError(error) }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  const lockCheck = await ensureHasLock(locals);
  if (!lockCheck.ok) return lockCheck.response;

  try {
    const { agentId } = await request.json();

    if (!agentId || typeof agentId !== "number") {
      return jsonResponse({ success: false, error: "ID de agente inválido" }, 400);
    }

    const result = await limpiarEstadoExcepcional(agentId);

    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error: any) {
    console.error("DELETE /api/disponibilidad/excepcional Error:", error);
    return jsonResponse({ success: false, error: sanitizeError(error) }, 500);
  }
};
