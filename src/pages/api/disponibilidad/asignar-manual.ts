import type { APIRoute } from "astro";
import { asignarManual } from "@/lib/disponibilidad";
import { db } from "@db/index";
import { agents } from "@db/schema";
import { eq } from "drizzle-orm";

import { requireWriteAccess } from "@/lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  try {
    const { agentId } = await request.json();

    if (!agentId || typeof agentId !== "number") {
      return new Response(JSON.stringify({ success: false, error: "ID de agente inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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

    return new Response(JSON.stringify({ ...result, agentName }), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST /api/disponibilidad/asignar-manual Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
