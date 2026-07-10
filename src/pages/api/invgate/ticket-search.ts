import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import type { InvgateIncident, InvgateUser } from "@/types/invgate";

function extractTicketId(query: string): number | null {
  const match = query.trim().match(/^#?(\d+)$/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return id > 0 ? id : null;
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return jsonResponse({ error: "?q= requiere al menos 2 caracteres" }, 400);
  }

  try {
    const ticketId = extractTicketId(q);

    if (!ticketId) {
      return jsonResponse({ tickets: [] }, 200);
    }

    const incidentResult = await invgateGet<InvgateIncident>(`incident?id=${ticketId}`);

    if (!incidentResult.ok) {
      return jsonResponse({ tickets: [] }, 200);
    }

    const incident = incidentResult.data;
    let customerName = "Usuario Desconocido";

    if (incident.user_id) {
      const userResult = await invgateGet<InvgateUser>(`user?id=${incident.user_id}`);
      if (userResult.ok && userResult.data) {
        const u = userResult.data;
        customerName = `${u.name} ${u.lastname}`.trim();
      }
    }

    const tickets = [
      {
        id: incident.id,
        title: incident.title || "Sin título",
        customer: customerName,
      },
    ];

    const limitedTickets = tickets.slice(0, 5);

    return jsonResponse(
      { tickets: limitedTickets },
      200,
      "private, max-age=60",
    );
  } catch (error: any) {
    console.error("[InvGate Ticket Search] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
