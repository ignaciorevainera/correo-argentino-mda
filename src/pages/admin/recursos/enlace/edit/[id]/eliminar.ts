import type { APIRoute } from "astro";
import { db } from "@db/index";
import { resourceLinks } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const linkId = params.id;
  if (!linkId) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("ID de enlace no proporcionado")}&toast_type=error`);
  }

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
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("Enlace eliminado con éxito")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar enlace:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("Error al eliminar el enlace")}&toast_type=error`);
  }
};
