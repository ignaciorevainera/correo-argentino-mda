import type { APIRoute } from "astro";
import { requestRelease } from "@lib/disponibilidad";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ locals }) => {
  const authError = await requireWriteAccess(locals, "asignacion_ag");
  if (authError) return authError;
  try {
    await requestRelease();
    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
