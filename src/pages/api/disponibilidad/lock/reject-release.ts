import type { APIRoute } from "astro";
import { rejectRelease } from "@lib/disponibilidad";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return jsonError("No autorizado", 401);
  }

  try {
    const success = await rejectRelease(locals.user.id);
    if (!success) {
      return jsonError("No podés rechazar una solicitud que no te pertenece", 403);
    }
    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonError(sanitizeError(error) || "Error al rechazar liberación", 500);
  }
};
