import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateIncident, InvgateByStatusResponse } from "@/types/invgate";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const id = url.searchParams.get("id");
    const statusId = url.searchParams.get("status_id");

    if (id) {
      const result = await invgateGet<InvgateIncident>(`incident?id=${id}`);

      if (!result.ok) {
        return jsonResponse({ error: result.message }, result.status);
      }

      return jsonResponse(result.data, result.status, "no-store");
    }

    if (statusId) {
      const page = url.searchParams.get("page") || "1";
      const pageSize = url.searchParams.get("page_size") || "10";

      const result = await invgateGet<InvgateByStatusResponse>(
        `incidents.by.status?status_id=${statusId}&page=${page}&page_size=${pageSize}`
      );

      if (!result.ok) {
        return jsonResponse({ error: result.message }, result.status);
      }

      return jsonResponse(result.data, result.status, "no-store");
    }

    return jsonResponse({ error: "Se requiere ?id= o ?status_id=" }, 400);
  } catch (error: any) {
    console.error("[InvGate Incidents] Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
