import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import type { InvgateGroup } from "@/types/invgate";
import { normalizeSearchValue } from "@lib/clientSearch";

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return jsonResponse({ error: "?q= requiere al menos 2 caracteres" }, 400);
  }

  try {
    const result = await invgateGet<InvgateGroup[]>("groups");

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const groups = Array.isArray(result.data) ? result.data : [];
    const normalizedQuery = normalizeSearchValue(q);

    const filtered = groups
      .filter((g) => normalizeSearchValue(g.name).includes(normalizedQuery))
      .slice(0, 10)
      .map((g) => ({
        id: g.id,
        name: g.name,
        totalMembers: g.total,
      }));

    return jsonResponse(
      { groups: filtered },
      200,
      "private, max-age=60",
    );
  } catch (error: any) {
    console.error("[InvGate Group Search] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
