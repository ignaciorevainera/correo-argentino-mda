import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/apiResponse";
import { syncOfficeInvgateLinks } from "@/lib/invgate/officeLinkSync";

function isAdmin(locals: App.Locals): boolean {
  return locals.user?.role === "admin";
}

export const GET: APIRoute = async ({ locals }) => {
  if (!isAdmin(locals)) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-sync] Iniciando sincronización (GET)...");
  const result = await syncOfficeInvgateLinks();

  return jsonResponse(result, result.ok ? 200 : 500);
};

export const POST: APIRoute = async ({ locals }) => {
  if (!isAdmin(locals)) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-sync] Iniciando sincronización manual (POST)...");
  const result = await syncOfficeInvgateLinks();

  if (result.ok) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${import.meta.env.BASE_URL || "/"}oficinas?toast_msg=Sincronizaci%C3%B3n+completada+${result.matched}+oficinas+vinculadas&toast_type=success`,
      },
    });
  }

  return jsonResponse(result, 500);
};
