import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
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

  if (!checkSlidingRateLimit(`rate:unassign:${user.id}`, 10, 60_000)) {
    return jsonResponse(
      { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
      429,
    );
  }

  try {
    const body = await request.json();
    const recordId = Number(body.recordId);

    if (!recordId || isNaN(recordId)) {
      return jsonResponse(
        { error: "recordId es requerido y debe ser un numero" },
        400,
      );
    }

    const [record] = await db
      .select({
        legacyName: supportGuides.legacyName,
        invgate_id: supportGuides.invgate_id,
      })
      .from(supportGuides)
      .where(eq(supportGuides.id, recordId));

    if (!record) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    if (
      user.helpdeskId !== null &&
      record.invgate_id !== null &&
      user.helpdeskId !== record.invgate_id
    ) {
      return jsonResponse(
        {
          error: "Acceso denegado: no puedes desasignar helpdesks de otra mesa",
        },
        403,
      );
    }

    await db
      .update(supportGuides)
      .set({ invgate_id: null })
      .where(eq(supportGuides.id, recordId));

    await logAdminActionStructured(
      user.username || "sistema",
      `Desvinculo la mesa de ayuda "${record.legacyName || `Registro #${recordId}`}".`,
      "support_guide",
      recordId,
      { invgate_id: record.invgate_id },
      { invgate_id: null },
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[unassign] Error:", err);
    return jsonResponse(
      { error: "Error interno al desvincular helpdesk" },
      500,
    );
  }
};
