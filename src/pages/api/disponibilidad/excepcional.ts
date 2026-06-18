import type { APIRoute } from "astro";
import { marcarEstadoExcepcional, limpiarEstadoExcepcional } from "@/lib/disponibilidad";

import { requireWriteAccess } from "@/lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  try {
    const { agentId, tipo, motivo, tiempoExtra } = await request.json();

    if (!agentId || typeof agentId !== "number") {
      return new Response(JSON.stringify({ success: false, error: "ID de agente inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!tipo || typeof tipo !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Tipo de excepción inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await marcarEstadoExcepcional(agentId, tipo, motivo, tiempoExtra);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST /api/disponibilidad/excepcional Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
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

    const result = await limpiarEstadoExcepcional(agentId);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("DELETE /api/disponibilidad/excepcional Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
