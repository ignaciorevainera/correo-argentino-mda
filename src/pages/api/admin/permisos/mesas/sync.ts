// src/pages/api/admin/permisos/mesas/sync.ts
import type { APIRoute } from "astro";
import { requireWriteAccess } from "../../../../../lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { syncMesas } from "../../../../../lib/permissions/mesaSync";
import { logAdminFromAstro } from "@lib/auditLogger";
import { validateRequestCsrf } from "@lib/csrf";
import { checkSlidingRateLimit } from "@lib/rateLimit";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "permisos");
  if (denied) return denied;

  if (!(await validateRequestCsrf(request, locals))) {
    return jsonResponse({ error: "Token CSRF inválido o ausente" }, 403);
  }

  if (!checkSlidingRateLimit(`mesas-sync:${locals.user.id}`, 5, 60000)) {
    return jsonResponse(
      { error: "Demasiadas solicitudes de sincronización. Intenta de nuevo en un minuto." },
      429,
    );
  }

  try {
    const result = await syncMesas();
    await logAdminFromAstro(locals, "permisos.mesas.sync");
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    // The empty-list guard throws "0 mesas" — a successful InvGate contact that
    // returned no data; surface as 400 (aborted), not a 502 transport failure.
    if (message.includes("0 mesas")) {
      return jsonError("InvGate devolvió 0 mesas; no se modificó la lista local.", 400);
    }
    // InvGate auth rejection or any other contact failure — do not echo upstream
    // internals to the client.
    console.error("Error en sync de mesas:", message);
    if (message.includes("401") || message.includes("403")) {
      return jsonError("InvGate rechazó la solicitud (verifica credenciales).", 502);
    }
    return jsonError("No se pudo contactar InvGate. Reintenta más tarde.", 502);
  }
};
