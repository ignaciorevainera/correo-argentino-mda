import type { APIRoute } from "astro";
import { db } from "@db/index";
import { applicationCategories } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
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

    db.transaction((tx) => {
      for (const item of items) {
        tx.update(applicationCategories)
          .set({ sortOrder: item.sortOrder })
          .where(eq(applicationCategories.id, item.id))
          .run();
      }
    });

    await logAdminAction(
      locals.user.username || "Sistema",
      `Reordenó ${items.length} categorías de aplicativos`
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[Reorder Categorias Aplicativos API] Error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al reordenar categorías" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
