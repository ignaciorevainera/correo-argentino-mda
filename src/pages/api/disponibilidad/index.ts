import type { APIRoute } from "astro";
import { getDisponibilidadHoy } from "@lib/disponibilidad";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";

export const GET: APIRoute = async ({ url, locals }) => {
  const authError = await requireReadAccess(locals, "asignacion_ag");
  if (authError) return authError;
  try {
    const forceRefresh = url.searchParams.get("force_refresh") === "true";
    const list = await getDisponibilidadHoy(forceRefresh);
    return jsonResponse(list, 200, "no-store, no-cache, must-revalidate");
  } catch (error: any) {
    console.error("GET /api/disponibilidad Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
