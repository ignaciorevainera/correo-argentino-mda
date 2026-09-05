// src/pages/api/admin/suggest-helpdesk.ts
import type { APIRoute } from "astro";
import { requireReadAccess } from "../../../lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { resolveUserRootHelpdesk } from "../../../lib/invgateHelpdesk";

export const GET: APIRoute = async ({ request, locals }) => {
  const denied = await requireReadAccess(locals, "permisos");
  if (denied) return denied;

  const username = new URL(request.url).searchParams.get("username")?.trim();
  if (!username) return jsonError("Falta el parametro username", 400);

  try {
    const helpdesk = await resolveUserRootHelpdesk(username);
    return jsonResponse({ helpdesk });
  } catch (err) {
    console.error("suggest-helpdesk error:", err);
    return jsonError("No se pudo consultar InvGate", 502);
  }
};
