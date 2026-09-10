import type { APIRoute } from "astro";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError, jsonError } from "@lib/apiResponse";
import { invgatePost, invgateGet } from "@lib/invgateClient";
import { invgateQaPost, invgateQaGet } from "@lib/invgate-qa-client";
import { logAdminAction } from "@lib/auditLogger";
import type { InvgateHelpdeskAndLevel } from "@/types/invgate";
import {
  USE_QA_INVGATE,
  AGENTS_TICKET_CATEGORY_ID,
  AGENTS_TICKET_PRIORITY_ID,
  AGENTS_TICKET_ASSIGN_GROUP_ID,
  QA_CUSTOMER_ID,
  buildTicketDescription,
  buildAgentsTicketTitle,
} from "@lib/telegrafiaTicket";
import { resolveInvgateLocationId } from "@lib/invgate/resolveOfficeLocation";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "usuarios");
  if (denied) return denied;

  const adminUsername = locals.user?.username;
  if (!adminUsername) {
    return jsonError("Usuario de sesión no válido", 401);
  }

  try {
    const body = await request.json();
    const officeCode = body?.officeCode;
    const officeName = body?.officeName;
    const observaciones =
      typeof body?.observaciones === "string" ? body.observaciones : undefined;
    const sourceId = body?.sourceId;

    if (typeof officeCode !== "string" || typeof officeName !== "string") {
      return jsonError(
        "Los campos officeCode y officeName son requeridos.",
        400,
      );
    }

    if (!officeCode.trim() || !officeName.trim()) {
      return jsonError(
        "Los campos officeCode y officeName no pueden estar vacíos.",
        400,
      );
    }

    if (typeof sourceId !== "number" || sourceId <= 0) {
      return jsonError("sourceId es requerido y debe ser un ID válido.", 400);
    }

    const getFn = USE_QA_INVGATE ? invgateQaGet : invgateGet;
    const postFn = USE_QA_INVGATE ? invgateQaPost : invgatePost;

    // --- Resolver el admin logueado en InvGate (agente de reasignación) ---
    // Intenta por username; si no hay match (p.ej. QA con username null),
    // cae al email derivado del dominio corporativo.
    let adminSearchRes = await getFn<{
      data: Record<string, { id: number; username: string }>;
    }>(`users.by?username=${encodeURIComponent(adminUsername)}`);

    if (
      !adminSearchRes.ok ||
      !adminSearchRes.data?.data ||
      Object.keys(adminSearchRes.data.data).length === 0
    ) {
      const emailFallback = `${adminUsername.toLowerCase()}@correoargentino.com.ar`;
      adminSearchRes = await getFn<{
        data: Record<string, { id: number; username: string }>;
      }>(`users.by?email=${encodeURIComponent(emailFallback)}`);
    }

    if (!adminSearchRes.ok) {
      return jsonError(
        `Error al buscar usuario en InvGate: ${adminSearchRes.message}`,
        500,
      );
    }

    const adminUserMap = adminSearchRes.data?.data;
    if (!adminUserMap || Object.keys(adminUserMap).length === 0) {
      return jsonError(
        `No se encontró el usuario ${adminUsername} en InvGate.`,
        404,
      );
    }

    const adminId = Object.values(adminUserMap)[0]?.id;
    if (!adminId) {
      return jsonError(
        `El usuario ${adminUsername} en InvGate no tiene un ID válido.`,
        404,
      );
    }

    // --- Validar membresía al helpdesk destino ANTES de crear el ticket ---
    const helpdesksRes =
      await getFn<InvgateHelpdeskAndLevel[]>("helpdesksandlevels");

    if (!helpdesksRes.ok || !Array.isArray(helpdesksRes.data)) {
      return jsonError(
        `Error al consultar las mesas de ayuda: ${
          "message" in helpdesksRes
            ? helpdesksRes.message
            : "respuesta inválida"
        }`,
        500,
      );
    }

    const group = helpdesksRes.data.find(
      (h) => h.id === AGENTS_TICKET_ASSIGN_GROUP_ID,
    );

    const memberIdSet = new Set<number>();
    if (group?.members_ids) {
      group.members_ids.forEach((m) => memberIdSet.add(m));
    }
    helpdesksRes.data
      .filter((h) => h.parent_id === AGENTS_TICKET_ASSIGN_GROUP_ID)
      .forEach((level) => {
        if (level.members_ids) {
          level.members_ids.forEach((m) => memberIdSet.add(m));
        }
      });

    if (!memberIdSet.has(adminId)) {
      return jsonError(
        `El usuario ${adminUsername} no pertenece a la mesa de ayuda destino (${AGENTS_TICKET_ASSIGN_GROUP_ID}).`,
        403,
      );
    }

    // --- Resolver el cliente (customer_id) ---
    let customerId: number;

    if (USE_QA_INVGATE) {
      customerId = QA_CUSTOMER_ID;
    } else {
      const customerIdFromBody = body?.customerId;
      if (typeof customerIdFromBody !== "number" || customerIdFromBody <= 0) {
        return jsonError(
          "customerId es requerido y debe ser un ID válido.",
          400,
        );
      }
      customerId = customerIdFromBody;
    }

    const invgateLocationId = await resolveInvgateLocationId(officeCode.trim());

    const description = buildTicketDescription(
      officeName.trim(),
      officeCode.trim(),
      observaciones,
    );

    const payload = {
      type_id: 2,
      category_id: AGENTS_TICKET_CATEGORY_ID,
      title: buildAgentsTicketTitle(officeCode.trim()),
      priority_id: AGENTS_TICKET_PRIORITY_ID,
      source_id: sourceId,
      customer_id: customerId,
      creator_id: adminId,
      description,
      location_id: invgateLocationId ?? undefined,
    };

    const res = await postFn<{
      status?: string;
      info?: string;
      error?: string;
      code?: number;
      request_id?: number | string;
      id?: number;
    }>("incident", payload);

    if (!res.ok) {
      return jsonError(res.message, 500);
    }

    // InvGate reports real failures as HTTP 200 with status:"ERROR" in the body
    if (res.data?.status && res.data.status !== "OK") {
      const reason = res.data.error || res.data.info || "Error desconocido";
      return jsonError(`InvGate rechazó el ticket: ${reason}`, 500);
    }

    const username = locals.user?.username || "Sistema";
    const envLabel = USE_QA_INVGATE ? "[QA] " : "";
    await logAdminAction(
      username,
      `${envLabel}Creó ticket de InvGate por agentes caídos en ${officeName.trim()} (${officeCode.trim()})`,
    );

    const id = res.data?.request_id || res.data?.id;

    if (!id) {
      return jsonError("No se pudo obtener el ID del ticket creado.", 500);
    }

    // --- Reasignar el ticket al admin logueado como agente ---
    const reassignRes = await postFn<{
      status?: string;
      info?: string;
      error?: string;
      code?: number;
    }>(
      `incident.reassign?group_id=${AGENTS_TICKET_ASSIGN_GROUP_ID}&agent_id=${adminId}&request_id=${id}&author_id=${adminId}`,
      undefined,
    );

    if (!reassignRes.ok) {
      return jsonError(
        `El ticket fue creado (#${id}) pero no se pudo reasignar: ${reassignRes.message}`,
        500,
      );
    }

    if (reassignRes.data?.status && reassignRes.data.status !== "OK") {
      return jsonError(
        `El ticket fue creado (#${id}) pero la reasignación falló: ${reassignRes.data.error || reassignRes.data.info || "Error desconocido"}`,
        500,
      );
    }

    const invgateBaseUrl = USE_QA_INVGATE
      ? import.meta.env.INVGATE_QA_BASE_URL ||
        process.env.INVGATE_QA_BASE_URL ||
        ""
      : import.meta.env.INVGATE_BASE_URL || process.env.INVGATE_BASE_URL || "";
    const cleanBaseUrl = invgateBaseUrl.replace(/\/api\/v1\/?$/, "");
    const ticketUrl = `${cleanBaseUrl}/requests/show/index/id/${id}`;

    return jsonResponse({ success: true, id, ticketUrl });
  } catch (error: any) {
    console.error("POST /api/offices/create-agents-ticket Error:", error);
    return jsonError(sanitizeError(error), 500);
  }
};
