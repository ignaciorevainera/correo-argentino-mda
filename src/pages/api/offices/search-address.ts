import type { APIRoute } from "astro";
import { db } from "@/db";
import { offices } from "@/db/schema";
import { isNotNull, and, sql, like } from "drizzle-orm";
import { normalizeSearchValue } from "@lib/clientSearch";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const q = url.searchParams.get("q");

  if (!q || q.length < 3) {
    return jsonResponse([]);
  }

  try {
    const normalizedQuery = normalizeSearchValue(q);

    const results = await db
      .select({
        address: offices.address,
        nis: sql<string>`min(${offices.code})`,
      })
      .from(offices)
      .where(
        and(
          isNotNull(offices.address),
          like(offices.searchableText, `%${normalizedQuery}%`)
        )
      )
      .groupBy(offices.address)
      .limit(6);

    return jsonResponse(results);
  } catch (error: any) {
    console.error("Error en search-address API:", error);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  }
};
