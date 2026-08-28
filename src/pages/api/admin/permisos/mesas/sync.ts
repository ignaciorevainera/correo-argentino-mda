// src/pages/api/admin/permisos/mesas/sync.ts
import type { APIRoute } from "astro";
import { requireWriteAccess } from "../../../../../lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { syncMesas } from "../../../../../lib/permissions/mesaSync";
import { logAdminFromAstro } from "@lib/auditLogger";

export const POST: APIRoute = async ({ locals }) => {
  const denied = await requireWriteAccess(locals, "permisos");
  if (denied) return denied;

  try {
    const result = await syncMesas();
    await logAdminFromAstro(locals, "permisos.mesas.sync");
    return jsonResponse(result);
  } catch (err: any) {
    const message = err?.message ?? "Error desconocido";
    if (message.includes("401") || message.includes("403")) {
      return jsonError(`InvGate rechazó la solicitud (${message})`, 502);
    }
    return jsonError(`No se pudo contactar InvGate: ${message}`, 502);
  }
};
