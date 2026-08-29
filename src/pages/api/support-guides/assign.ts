import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides, mesas } from "@db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { logAdminActionStructured } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";
import { ROLE_HIERARCHY } from "@lib/rbac";
import { validateRequestCsrf } from "@lib/csrf";
import { checkSlidingRateLimit } from "@lib/rateLimit";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (
    !user ||
    ROLE_HIERARCHY[user.role as keyof typeof ROLE_HIERARCHY] <
      ROLE_HIERARCHY.supervisor
  ) {
    return jsonResponse({ error: "Acceso denegado" }, 403);
  }

  if (!(await validateRequestCsrf(request, locals))) {
    return jsonResponse({ error: "Token CSRF inválido o ausente" }, 403);
  }

  if (!checkSlidingRateLimit(`rate:assign:${user.id}`, 10, 60_000)) {
    return jsonResponse(
      { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
      429,
    );
  }

  try {
    const body = await request.json();
    const recordId = Number(body.recordId);
    const invgateId = Number(body.invgate_id);

    if (!recordId || !invgateId || isNaN(recordId) || isNaN(invgateId)) {
      return jsonResponse(
        { error: "recordId e invgate_id son requeridos y deben ser numeros" },
        400,
      );
    }

    const [mesa] = await db
      .select({ id: mesas.id })
      .from(mesas)
      .where(and(eq(mesas.invgateId, invgateId), eq(mesas.active, true)));

    if (!mesa) {
      return jsonResponse(
        { error: "Helpdesk no existe en la base de datos" },
        400,
      );
    }

    if (user.helpdeskId !== null && user.helpdeskId !== invgateId) {
      return jsonResponse(
        { error: "Acceso denegado: no puedes asignar helpdesks de otra mesa" },
        403,
      );
    }

    const [record] = await db
      .select({ legacyName: supportGuides.legacyName, invgate_id: supportGuides.invgate_id })
      .from(supportGuides)
      .where(eq(supportGuides.id, recordId));

    if (!record) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    // Atomic guard: update only succeeds if the record's current helpdesk
    // is still null or belongs to the requesting user's mesa (prevents
    // select/update race where another request reassigns in between).
    const conditions = [eq(supportGuides.id, recordId)];
    if (user.helpdeskId !== null) {
      conditions.push(
        or(
          isNull(supportGuides.invgate_id),
          eq(supportGuides.invgate_id, user.helpdeskId),
        )!,
      );
    }

    const result = await db
      .update(supportGuides)
      .set({ invgate_id: invgateId })
      .where(and(...conditions));

    if (!result || result.changes === 0) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    await logAdminActionStructured(
      user.username || "sistema",
      `Asigno la mesa de ayuda "${record.legacyName || `Registro #${recordId}`}" al helpdesk de InvGate ID ${invgateId}.`,
      "support_guide",
      recordId,
      { invgate_id: record.invgate_id },
      { invgate_id: invgateId },
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[assign] Error:", err);
    return jsonResponse({ error: "Error interno al asignar helpdesk" }, 500);
  }
};
