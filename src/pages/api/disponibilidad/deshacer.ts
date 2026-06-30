import type { APIRoute } from "astro";
import { deshacerAsignacion } from "@lib/disponibilidad";
import { normalizeRole } from "@lib/rbac";

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  const role = normalizeRole(user?.role);
  if (role === "agent") {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 });
  }

  try {
    const res = await deshacerAsignacion();
    if (res.success) {
      return new Response(JSON.stringify({ success: true, agentName: res.agentName }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: res.error }), { status: 400 });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Error al deshacer la asignación" }), { status: 500 });
  }
};
