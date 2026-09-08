import type { APIRoute } from "astro";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError, jsonError } from "@lib/apiResponse";
import { invgatePost, invgateGet } from "@lib/invgateClient";
import { logAdminAction } from "@lib/auditLogger";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "usuarios");
  if (denied) return denied;

  const adminUsername = locals.user?.username;
  if (!adminUsername) {
    return jsonError("Usuario de sesión no válido", 401);
  }

  try {
    const body = await request.json();
    const usuarioRaw = body?.usuario;
    const nombreCompletoRaw = body?.nombreCompleto;
    const dniRaw = body?.dni;

    if (
      typeof usuarioRaw !== "string" ||
      typeof nombreCompletoRaw !== "string" ||
      (typeof dniRaw !== "string" && typeof dniRaw !== "number")
    ) {
      return jsonError(
        "Los campos usuario, nombreCompleto y dni son requeridos y deben ser válidos.",
        400,
      );
    }

    const usuario = usuarioRaw.trim();
    const nombreCompleto = nombreCompletoRaw.trim();
    const dni = String(dniRaw).trim();

    if (!usuario || !nombreCompleto || !dni) {
      return jsonError(
        "Los campos usuario, nombreCompleto y dni no pueden estar vacíos.",
        400,
      );
    }

    // Buscar el usuario administrador en InvGate para obtener su ID
    const searchRes = await invgateGet<{
      data: Record<string, { id: number; username: string }>;
    }>(`users.by?username=${encodeURIComponent(adminUsername)}`);

    if (!searchRes.ok) {
      return jsonError(
        `Error al buscar usuario en InvGate: ${searchRes.message}`,
        500,
      );
    }

    const userDataMap = searchRes.data?.data;
    if (!userDataMap || Object.keys(userDataMap).length === 0) {
      return jsonError(
        `No se encontró el usuario administrador ${adminUsername} en InvGate.`,
        404,
      );
    }

    const firstUserIdStr = Object.keys(userDataMap)[0];
    const invgateUserId = userDataMap[firstUserIdStr]?.id;

    if (!invgateUserId) {
      return jsonError(
        `El usuario administrador ${adminUsername} en InvGate no tiene un ID válido.`,
        404,
      );
    }

    const description = `Se solicita asignar al usuario en el grupo InvGate Service Management | Usuarios y grupos.<br><table style="width: 100%; max-width: 600px; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #334155;"><tr><td style="padding: 6px 12px; font-weight: bold; text-transform: uppercase; width: 180px; background-color: #f1f5f9; border: 1px solid #e2e8f0;">Usuario de red</td><td style="padding: 6px 12px; background-color: #ffffff; border: 1px solid #e2e8f0;">${usuario}</td></tr><tr><td style="padding: 6px 12px; font-weight: bold; text-transform: uppercase; background-color: #f1f5f9; border: 1px solid #e2e8f0;">Nombre completo</td><td style="padding: 6px 12px; background-color: #ffffff; border: 1px solid #e2e8f0;">${nombreCompleto}</td></tr><tr><td style="padding: 6px 12px; font-weight: bold; text-transform: uppercase; background-color: #f1f5f9; border: 1px solid #e2e8f0;">DNI</td><td style="padding: 6px 12px; background-color: #ffffff; border: 1px solid #e2e8f0;">${dni}</td></tr><tr><td style="padding: 6px 12px; font-weight: bold; text-transform: uppercase; background-color: #f1f5f9; border: 1px solid #e2e8f0;">Correo corporativo</td><td style="padding: 6px 12px; background-color: #ffffff; border: 1px solid #e2e8f0;">${usuario.toLowerCase()}@correoargentino.com.ar</td></tr></table>`;

    const payload = {
      type_id: 2,
      category_id: 2589,
      title: "InvGate - Grupo faltante",
      priority_id: 1,
      customer_id: invgateUserId,
      creator_id: invgateUserId,
      description: description,
    };

    const res = await invgatePost<{
      request_id: number;
      id: number;
    }>("incident", payload);

    if (!res.ok) {
      return jsonError(res.message, 500);
    }

    const username = locals.user?.username || "Sistema";
    await logAdminAction(
      username,
      `Creó ticket de InvGate para alta de grupo de ${nombreCompleto} (${usuario})`,
    );

    const id = res.data?.request_id || res.data?.id;
    const invgateBaseUrl =
      import.meta.env.INVGATE_BASE_URL || process.env.INVGATE_BASE_URL || "";
    const cleanBaseUrl = invgateBaseUrl.replace(/\/api\/v1\/?$/, "");
    const ticketUrl = id
      ? `${cleanBaseUrl}/requests/show/index/id/${id}`
      : null;

    return jsonResponse({ success: true, id, ticketUrl });
  } catch (error: any) {
    console.error("POST /api/usuarios/create-invgate-ticket Error:", error);
    return jsonError(sanitizeError(error), 500);
  }
};
