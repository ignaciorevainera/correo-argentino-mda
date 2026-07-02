import type { APIRoute } from "astro";
import { db } from "@db/index";
import { cubics, cubicAssignments } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";
import { getBaseNoSlash } from "@lib/baseUrl";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const user = locals.user;
  if (!user || !isAllowed("Administrar Contenido", user.role)) {
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`);
  }

  const cubicId = Number(params.id);
  if (!cubicId || isNaN(cubicId)) {
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("ID de cubic no proporcionado")}&toast_type=error`);
  }

  try {
    await db.delete(cubicAssignments).where(eq(cubicAssignments.cubicId, cubicId));

    const [deleted] = await db
      .delete(cubics)
      .where(eq(cubics.id, cubicId))
      .returning({ name: cubics.name });

    if (deleted) {
      await logAdminAction(
        user.username || "Sistema",
        `Eliminó el cubic "${deleted.name}"`
      );
    }

    const cleanBase = getBaseNoSlash();

    if (deleted) {
      return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent(`Ordenador "${deleted.name}" dado de baja con éxito.`)}&toast_type=success`);
    } else {
      return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("El cubic no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error deleting cubic:", error);
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("Error al eliminar el cubic")}&toast_type=error`);
  }
};
