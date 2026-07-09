import type { APIRoute } from "astro";
import { can } from "@lib/roleConfig";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { getOrRefreshComparison } from "@lib/invgate/locationCache";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "admin")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  try {
    const { data, error, status } = await getOrRefreshComparison();

    if (error || !data) {
      return jsonResponse({ error: error || "Sin datos" }, status || 500);
    }

    return jsonResponse(data.stats);
  } catch (error: any) {
    console.error("[Stats API] Error:", error);
    return jsonResponse({ error: sanitizeError(error) || "Error interno del servidor" }, 500);
  }
};
