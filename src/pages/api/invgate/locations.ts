import type { APIRoute } from "astro";
import { can } from "@lib/roleConfig";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { getOrRefreshComparison } from "@lib/invgate/locationCache";

export const GET: APIRoute = async ({ locals, request }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "team_leader")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const page = parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10) || 50;
    const filter = url.searchParams.get("filter") ?? "all";
    const q = url.searchParams.get("q") ?? "";

    if (action === "sync") {
      const { clearCache } = await import("@lib/invgate/locationCache");
      clearCache();
    }

    const { data: cachedComparison, error, status } = await getOrRefreshComparison();

    if (error && !cachedComparison) {
      if (status === 428) {
        return jsonResponse({
          results: [],
          stats: null,
          pagination: { page: 1, limit, totalPages: 1, totalItems: 0 },
        });
      }
      return jsonResponse({ error }, status || 500);
    }

    if (!cachedComparison) {
      return jsonResponse({
        results: [],
        stats: null,
        pagination: { page: 1, limit, totalPages: 1, totalItems: 0 },
      });
    }

    let filtered = cachedComparison.results;

    if (filter === "matched") {
      filtered = filtered.filter((r) => r.matched);
    } else if (filter === "unmatched") {
      filtered = filtered.filter((r) => !r.matched);
    }

    const query = q.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((r) => {
        const inv = r.invgateLocation;
        return (
          inv.displayName.toLowerCase().includes(query) ||
          inv.name.toLowerCase().includes(query) ||
          (inv.nis && inv.nis.toLowerCase().includes(query)) ||
          (inv.cp && inv.cp.toLowerCase().includes(query)) ||
          (inv.cc && inv.cc.toLowerCase().includes(query))
        );
      });
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const paginatedResults = filtered.slice(offset, offset + limit);

    return jsonResponse({
      results: paginatedResults,
      stats: cachedComparison.stats,
      pagination: {
        page: safePage,
        limit,
        totalPages,
        totalItems,
      },
    });
  } catch (error: any) {
    console.error("[Locations API] Error:", error);
    return jsonResponse({ error: sanitizeError(error) || "Error interno del servidor" }, 500);
  }
};
