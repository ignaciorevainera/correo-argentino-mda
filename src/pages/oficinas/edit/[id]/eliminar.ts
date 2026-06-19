import type { APIRoute } from "astro";
import { db } from "@db/index";
import { offices } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const user = locals.user;
  if (!user || !isAllowed("Administrar Contenido", user.role)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`);
  }

  const officeId = Number(params.id);
  if (!officeId || isNaN(officeId)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("ID de oficina no proporcionado")}&toast_type=error`);
  }

  try {
    const [deleted] = await db
      .delete(offices)
      .where(eq(offices.id, officeId))
      .returning({ code: offices.code, name: offices.name });

    if (deleted) {
      await logAdminAction(
        user.username || "Sistema",
        `Eliminó la oficina "${deleted.name}" (${deleted.code})`
      );
    }

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;

    if (deleted) {
      return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent(`Oficina "${deleted.name}" (${deleted.code}) eliminada con éxito.`)}&toast_type=success`);
    } else {
      return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("La oficina no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error deleting office:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("Error al eliminar la oficina")}&toast_type=error`);
  }
};
