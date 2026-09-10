import type { APIRoute } from "astro";
import type { InvgateByStatusResponse, InvgateIncident } from "@/types/invgate";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { invgateGet } from "@lib/invgateClient";
import { invgateQaGet } from "@lib/invgate-qa-client";
import {
  USE_QA_INVGATE,
  AGENTS_TICKET_CATEGORY_IDS,
  isAgentsTicketTitle,
} from "@lib/telegrafiaTicket";
import { resolveInvgateLocationId } from "@lib/invgate/resolveOfficeLocation";

export const GET: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "usuarios");
  if (denied) return denied;

  const url = new URL(request.url);
  const officeCode = url.searchParams.get("officeCode");

  if (!officeCode || !officeCode.trim()) {
    return jsonError("El parámetro officeCode es requerido.", 400);
  }

  try {
    const invgateLocationId = await resolveInvgateLocationId(officeCode.trim());

    if (invgateLocationId === null) {
      return jsonResponse({
        exists: false,
        reason: "No se encontró ubicación de InvGate para esta oficina.",
      });
    }

    const getFn = USE_QA_INVGATE ? invgateQaGet : invgateGet;

    const MAX_PAGES = 60;

    // Step 1a: Fast path — status 1 (Nuevo) filtered by location server-side.
    // InvGate honors location_id ONLY with a single status_id and only for status 1.
    const locationNewIds: number[] = [];
    let newOffset = 0;
    let newTotal = 1;
    let newPages = 0;

    while (newOffset < newTotal && newPages < MAX_PAGES) {
      const newAtLocationRes = await getFn<InvgateByStatusResponse>(
        `incidents.by.status?status_id=1&location_id=${invgateLocationId}&limit=200&offset=${newOffset}`,
      );

      if (!newAtLocationRes.ok || !newAtLocationRes.data?.requestIds) {
        return jsonResponse({
          exists: false,
          reason: "No se pudieron consultar los tickets nuevos.",
        });
      }

      locationNewIds.push(...newAtLocationRes.data.requestIds);
      newTotal = newAtLocationRes.data.total ?? locationNewIds.length;
      newOffset += newAtLocationRes.data.requestIds.length;
      newPages++;
    }

    // Step 1b: Slow path — remaining open statuses (2-5) have no server-side
    // location filter, so scan the global open set.
    const openStatusQuery = [2, 3, 4, 5]
      .map((s) => `status_ids[]=${s}`)
      .join("&");
    const requestIds: number[] = [];
    let offset = 0;
    let total = 1;
    let pages = 0;

    while (offset < total && pages < MAX_PAGES) {
      const pageRes = await getFn<InvgateByStatusResponse>(
        `incidents.by.status?${openStatusQuery}&limit=200&offset=${offset}`,
      );

      if (!pageRes.ok || !pageRes.data?.requestIds) {
        return jsonResponse({
          exists: false,
          reason: "No se pudieron consultar los tickets abiertos.",
        });
      }

      requestIds.push(...pageRes.data.requestIds);
      total = pageRes.data.total ?? requestIds.length;
      offset += pageRes.data.requestIds.length;
      pages++;
    }

    // Step 2: Fetch full objects. Parallelize the batch fetch (the bottleneck:
    // each incidents?ids[]=500 request takes ~8s). 4 workers cut 67s -> ~17s.
    const CHUNK = 500;
    const CONCURRENCY = 4;
    const chunks: number[][] = [];
    for (let i = 0; i < requestIds.length; i += CHUNK) {
      chunks.push(requestIds.slice(i, i + CHUNK));
    }

    const incidents: InvgateIncident[] = [];
    let chunkIdx = 0;

    async function fetchChunk(): Promise<void> {
      while (chunkIdx < chunks.length) {
        const chunk = chunks[chunkIdx++];
        const idsQuery = chunk.map((id) => `ids[]=${id}`).join("&");
        const chunkRes = await getFn<Record<string, InvgateIncident>>(
          `incidents?${idsQuery}`,
        );

        if (!chunkRes.ok || !chunkRes.data) {
          throw new Error(
            "message" in chunkRes
              ? chunkRes.message
              : "No se pudieron obtener los detalles de los tickets.",
          );
        }

        incidents.push(...Object.values(chunkRes.data));
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => fetchChunk()));

    // Step 3: Filter by location and either category or title pattern
    const locationNewIncidents: InvgateIncident[] = [];

    for (let i = 0; i < locationNewIds.length; i += CHUNK) {
      const chunk = locationNewIds.slice(i, i + CHUNK);
      const newIdsQuery = chunk.map((id) => `ids[]=${id}`).join("&");
      const newRes = await getFn<Record<string, InvgateIncident>>(
        `incidents?${newIdsQuery}`,
      );

      if (!newRes.ok || !newRes.data) {
        throw new Error(
          "message" in newRes
            ? newRes.message
            : "No se pudieron obtener los detalles de los tickets nuevos.",
        );
      }

      locationNewIncidents.push(...Object.values(newRes.data));
    }

    const allCandidates = [...incidents, ...locationNewIncidents];
    const matchingIncident = allCandidates.find(
      (inc) =>
        inc.location_id === invgateLocationId &&
        (AGENTS_TICKET_CATEGORY_IDS.includes(inc.category_id ?? -1) ||
          isAgentsTicketTitle(inc.title)),
    );

    if (!matchingIncident) {
      return jsonResponse({ exists: false });
    }

    // Step 4: Build ticket URL
    const invgateBaseUrl = USE_QA_INVGATE
      ? import.meta.env.INVGATE_QA_BASE_URL || ""
      : import.meta.env.INVGATE_BASE_URL || "";
    const cleanBaseUrl = invgateBaseUrl.replace(/\/api\/v1\/?$/, "");
    const ticketUrl = `${cleanBaseUrl}/requests/show/index/id/${matchingIncident.id}`;

    return jsonResponse({
      exists: true,
      ticketId: matchingIncident.id,
      ticketTitle: matchingIncident.title,
      ticketUrl,
    });
  } catch (error: any) {
    console.error("GET /api/offices/check-agents-ticket Error:", error);
    return jsonError(
      error?.message || "Error al verificar tickets existentes.",
      500,
    );
  }
};
