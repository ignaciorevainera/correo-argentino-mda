import type { APIRoute } from "astro";
import { db } from "@db/index";
import { resourceLinks } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { getBaseNoSlash } from "@lib/baseUrl";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const linkId = params.id;
  if (!linkId) {
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("ID de enlace no proporcionado")}&toast_type=error`);
  }

  const idNum = parseInt(linkId, 10);
  if (isNaN(idNum)) {
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("ID de enlace inválido")}&toast_type=error`);
  }

  try {
    const existing = await db.query.resourceLinks.findFirst({
        where: eq(resourceLinks.id, idNum),
    });

    if (existing) {
        await db.delete(resourceLinks).where(eq(resourceLinks.id, idNum));
        await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó el enlace "${existing.title}"`);
    }

    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("Enlace eliminado con éxito")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar enlace:", error);
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("Error al eliminar el enlace")}&toast_type=error`);
  }
};
