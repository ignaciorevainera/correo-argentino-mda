import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const user = locals.user;
  if (!user || !isAllowed("Administrar Contenido", user.role)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`);
  }

  const guideId = Number(params.id);
  if (!guideId || isNaN(guideId)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("ID de soporte no proporcionado")}&toast_type=error`);
  }

  try {
    const [deleted] = await db
      .delete(supportGuides)
      .where(eq(supportGuides.id, guideId))
      .returning({ helpDeskName: supportGuides.helpDeskName });

    if (deleted) {
      await logAdminAction(
        user.username || "Sistema",
        `Eliminó el soporte "${deleted.helpDeskName}"`
      );
    }

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;

    if (deleted) {
      return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent(`Soporte "${deleted.helpDeskName}" eliminado con éxito.`)}&toast_type=success`);
    } else {
      return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("El soporte no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error deleting support guide:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("Error al eliminar el soporte")}&toast_type=error`);
  }
};
