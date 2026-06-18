import type { APIRoute } from "astro";
import { db } from "@/db";
import { resourceLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { items } = await request.json();

    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "Datos inválidos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Actualización masiva de orden y categoría
    db.transaction((tx) => {
      for (const item of items) {
        tx.update(resourceLinks)
          .set({
            sortOrder: item.sortOrder,
            categoryId: item.categoryId,
          })
          .where(eq(resourceLinks.id, item.id))
          .run();
      }
    });

    await logAdminAction(
      locals.user.username || "Sistema",
      `Reordenó y/o recategorizó ${items.length} enlaces de recursos`
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[Reorder API] Error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al reordenar" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
