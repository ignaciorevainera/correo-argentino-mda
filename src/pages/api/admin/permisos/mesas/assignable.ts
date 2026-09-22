// src/pages/api/admin/permisos/mesas/assignable.ts
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { mesas } from "@db/schema";
import { eq } from "drizzle-orm";
import { requireWriteAccess } from "../../../../../lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { logAdminFromAstro } from "@lib/auditLogger";
import { validateRequestCsrf } from "@lib/csrf";
import { checkSlidingRateLimit } from "@lib/rateLimit";
import { MDA_TI_HELPDESK } from "@lib/helpdeskAccess";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "permisos");
  if (denied) return denied;

  if (!(await validateRequestCsrf(request, locals))) {
    return jsonResponse({ error: "Token CSRF inválido o ausente" }, 403);
  }

  if (!checkSlidingRateLimit(`mesas-assignable:${locals.user.id}`, 30, 60000)) {
    return jsonResponse(
      { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
      429,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido", 400);
  }

  const invgateId = (body as { invgateId?: unknown })?.invgateId;
  const assignable = (body as { assignable?: unknown })?.assignable;

  if (typeof invgateId !== "number" || !Number.isFinite(invgateId) || invgateId <= 0) {
    return jsonError("invgateId inválido", 400);
  }
  if (typeof assignable !== "boolean") {
    return jsonError("assignable debe ser booleano", 400);
  }

  const [mesa] = await db
    .select()
    .from(mesas)
    .where(eq(mesas.invgateId, invgateId))
    .limit(1);

  if (!mesa) {
    return jsonError("Mesa no encontrada", 404);
  }

  if (assignable === false && mesa.name === MDA_TI_HELPDESK) {
    return jsonError("La mesa principal (MDA TI) no puede deshabilitarse.", 400);
  }

  if (mesa.assignable !== assignable) {
    await db
      .update(mesas)
      .set({ assignable })
      .where(eq(mesas.id, mesa.id));

    const accion = assignable ? "Habilitó" : "Deshabilitó";
    await logAdminFromAstro(
      locals,
      `${accion} la mesa "${mesa.name}" para asignación`,
    );
  }

  return jsonResponse({ success: true, invgateId, assignable });
};
