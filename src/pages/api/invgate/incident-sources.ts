import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { USE_QA_INVGATE } from "@lib/telegrafiaTicket";

export interface IncidentSource {
  id: number;
  name: string;
}

// Orígenes permitidos para el ticket de desconexión de agentes
const ALLOWED_SOURCE_IDS = [1, 3, 8]; // Correo, Teléfono, API

export const GET: APIRoute = async ({ locals }) => {
  const denied = requireWriteAccess(locals, "usuarios");
  if (denied) return denied;

  try {
    const getFn = USE_QA_INVGATE ? invgateQaGet : invgateGet;

    const res = await getFn<IncidentSource[]>("incident.attributes.source");
    if (!res.ok) {
      return jsonResponse({ error: res.message }, res.status);
    }

    const all = Array.isArray(res.data) ? res.data : [];
    const sources = all.filter((s) => ALLOWED_SOURCE_IDS.includes(s.id));

    return jsonResponse({ sources }, 200, "private, max-age=300");
  } catch (error: any) {
    console.error("[Incident Sources] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
