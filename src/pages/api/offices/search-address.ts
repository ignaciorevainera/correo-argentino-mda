import type { APIRoute } from "astro";
import { db } from "@/db";
import { offices } from "@/db/schema";
import { isNotNull, and, sql } from "drizzle-orm";
import { normalizeSearchValue } from "@lib/clientSearch";

export const GET: APIRoute = async ({ url, locals }) => {
  // Verificación de autenticación basada en Astro.locals.user
  if (!locals.user || locals.user.id === 0) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const q = url.searchParams.get("q");

  if (!q || q.length < 3) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const normalizedQuery = normalizeSearchValue(q);

    // Agrupamos por dirección para evitar duplicados y limitar a 6 resultados.
    // Usamos min(offices.code) como NIS representativo para cada dirección.
    const results = await db
      .select({
        address: offices.address,
        nis: sql<string>`min(${offices.code})`,
      })
      .from(offices)
      .where(
        and(
          isNotNull(offices.address),
          sql`${offices.id} IN (SELECT rowid FROM offices_fts WHERE searchable_text MATCH ${'"' + normalizedQuery + '"'})`
        )
      )
      .groupBy(offices.address)
      .limit(6);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error en search-address API:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
