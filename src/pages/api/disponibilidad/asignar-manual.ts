import type { APIRoute } from "astro";
import { asignarManual } from "@lib/disponibilidad";
import { db } from "@db/index";
import { agents } from "@db/schema";
import { eq } from "drizzle-orm";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  try {
    const { agentId } = await request.json();

    if (!agentId || typeof agentId !== "number") {
      return jsonResponse({ success: false, error: "ID de agente inválido" }, 400);
    }

    const assignedBy = locals.user?.name || locals.user?.username || "Sistema";
    const result = await asignarManual(agentId, assignedBy);
    
    let agentName = `ID ${agentId}`;
    try {
      const [ag] = await db
        .select({ name: agents.name })
        .from(agents)
        .where(eq(agents.id, agentId));
      if (ag) {
        agentName = ag.name;
      }
    } catch (dbErr) {
      console.error("Error retrieving agent name:", dbErr);
    }

    return jsonResponse({ ...result, agentName }, result.success ? 200 : 400);
  } catch (error: any) {
    console.error("POST /api/disponibilidad/asignar-manual Error:", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
};
