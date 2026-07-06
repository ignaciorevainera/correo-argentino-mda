import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse } from "@lib/apiResponse";
import type { InvgateLocation } from "@/types/invgate";
import { normalizeSearchValue } from "@lib/clientSearch";

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return jsonResponse({ error: "?q= requiere al menos 2 caracteres" }, 400);
  }

  try {
    const result = await invgateGet<InvgateLocation[]>("locations");

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const locations = Array.isArray(result.data) ? result.data : [];
    const normalizedQuery = normalizeSearchValue(q);

    const filtered = locations
      .filter((loc) => normalizeSearchValue(loc.name).includes(normalizedQuery))
      .slice(0, 10)
      .map((loc) => ({
        id: loc.id,
        name: loc.name,
        totalUsers: loc.total,
      }));

    return jsonResponse(
      { locations: filtered },
      200,
      "private, max-age=60",
    );
  } catch (error: any) {
    console.error("[InvGate Location Search] Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
