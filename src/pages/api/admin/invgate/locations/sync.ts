import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/apiResponse";
import { syncOfficeInvgateLinks } from "@/lib/invgate/officeLinkSync";
import { can } from "@/lib/roleConfig";

function hasAccess(locals: App.Locals): boolean {
  return locals.user ? can(locals.user.role, "team_leader") : false;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!hasAccess(locals)) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-sync] Iniciando sincronización (GET)...");
  const result = await syncOfficeInvgateLinks();

  return jsonResponse(result, result.ok ? 200 : 500);
};

export const POST: APIRoute = async ({ locals }) => {
  if (!hasAccess(locals)) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-sync] Iniciando sincronización manual (POST)...");
  const result = await syncOfficeInvgateLinks();

  return jsonResponse(result, result.ok ? 200 : 500);
};
