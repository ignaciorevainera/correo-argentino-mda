import type { APIRoute } from "astro";
import { db } from "@db/index";
import { resourceLinks } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const linkId = params.id;
  if (!linkId) return new Response("ID de enlace no proporcionado", { status: 400 });

  try {
    const existing = await db.query.resourceLinks.findFirst({
        where: eq(resourceLinks.id, linkId),
    });

    if (existing) {
        await db.delete(resourceLinks).where(eq(resourceLinks.id, linkId));
        await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó el enlace "${existing.title}"`);
    }

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/recursos`);
  } catch (error) {
    console.error("Error al eliminar enlace:", error);
    return new Response("Error interno del servidor", { status: 500 });
  }
};
