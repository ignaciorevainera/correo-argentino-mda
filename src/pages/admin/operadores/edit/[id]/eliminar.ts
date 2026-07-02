import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { getBaseNoSlash } from "@lib/baseUrl";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const operatorId = params.id;
  if (!operatorId || isNaN(Number(operatorId))) {
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/operadores?toast_msg=${encodeURIComponent("ID de operador no proporcionado")}&toast_type=error`);
  }

  try {
    const [deleted] = await db
      .delete(agents)
      .where(eq(agents.id, Number(operatorId)))
      .returning({ id: agents.id, name: agents.name });

    if (deleted) {
      await db.delete(schedules).where(eq(schedules.agentName, deleted.name));
      await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó el operador "${deleted.name}"`);
    }

    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/operadores?toast_msg=${encodeURIComponent("Operador eliminado con éxito.")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar operador:", error);
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/operadores?toast_msg=${encodeURIComponent("Error al eliminar el operador.")}&toast_type=error`);
  }
};
