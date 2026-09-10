import type { APIRoute } from "astro";
import { findOfficeAddressMatches } from "@lib/officeQueries";
import { normalizeOfficeAddress } from "@lib/officeAddress";
import { buildAddressSuggestions } from "@lib/officeAddressSuggestions";
import { jsonResponse } from "@lib/apiResponse";

const MAX_SUGGESTIONS = 6;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const query = url.searchParams.get("q") ?? "";
  if (query.trim().length < 3) return jsonResponse([]);

  const excludeIdValue = url.searchParams.get("excludeId");
  const excludeId = excludeIdValue ? Number(excludeIdValue) : undefined;
  const provinceCode = url.searchParams.get("provinceCode") || undefined;

  try {
    const matches = await findOfficeAddressMatches({
      address: query,
      provinceCode,
      excludeId: Number.isInteger(excludeId) ? excludeId : undefined,
      partial: true,
    });
    const normalizedQuery = normalizeOfficeAddress(query) ?? "";
    const result = buildAddressSuggestions(matches, normalizedQuery).slice(
      0,
      MAX_SUGGESTIONS,
    );
    return jsonResponse(result);
  } catch (error) {
    console.error("Error en search-address API:", error);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  }
};
