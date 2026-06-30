import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateIncidentsResponse } from "@/types/invgate";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const start = Date.now();
    const result = await invgateGet<InvgateIncidentsResponse>("incidents?page=1&page_size=1");
    const elapsed = Date.now() - start;

    if (!result.ok) {
      return jsonResponse({
        ok: false,
        message: result.message,
        elapsed,
      }, result.status);
    }

    return jsonResponse({
      ok: true,
      elapsed,
      totalIncidents: result.data.pagination?.total_entries ?? 0,
      sample: result.data.data?.[0] ?? null,
    });
  } catch (error: any) {
    console.error("[InvGate Ping] Error:", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
};
