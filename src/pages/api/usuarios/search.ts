import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { like, or } from "drizzle-orm";
import { jsonResponse, jsonError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || "";

    if (!q) {
      return jsonResponse({ results: [], total: 0 });
    }

    // Escape SQLite LIKE wildcards
    const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escaped}%`;

    const results = await db
      .select()
      .from(employees)
      .where(
        or(
          like(employees.fullname, searchPattern),
          like(employees.username, searchPattern),
          like(employees.dni, searchPattern),
        ),
      )
      .orderBy(employees.fullname)
      .limit(50);

    return jsonResponse({
      results: results.map((e) => ({
        fullname: e.fullname,
        dni: e.dni,
        username: e.username,
        interno: e.interno,
        telefono: e.telefono,
        sucursal: e.sucursal,
      })),
      total: results.length,
    });
  } catch (error) {
    console.error("[UserSearch] Error:", error);
    return jsonError("Error al buscar usuarios", 500);
  }
};
