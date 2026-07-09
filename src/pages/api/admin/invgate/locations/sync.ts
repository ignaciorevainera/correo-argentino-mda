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

  return jsonResponse(result, result.ok ? 200 : 500);
};
