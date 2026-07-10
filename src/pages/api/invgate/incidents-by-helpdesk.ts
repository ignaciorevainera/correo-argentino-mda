import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateByStatusResponse } from "@/types/invgate";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ url }) => {
  try {
    const helpdeskId = url.searchParams.get("helpdesk_id");

    if (!helpdeskId) {
      return jsonResponse({ error: "Se requiere ?helpdesk_id=" }, 400);
    }

    const result = await invgateGet<InvgateByStatusResponse>(
      `incidents.by.helpdesk?helpdesk_id=${helpdeskId}`
    );

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    // incidents.by.helpdesk returns an object with requestIds[] containing IDs of active requests
    const total = Array.isArray(result.data.requestIds) ? result.data.requestIds.length : 0;

    return jsonResponse({ total }, result.status, "no-store");
  } catch (error: any) {
    console.error("[InvGate Helpdesk Incidents] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
