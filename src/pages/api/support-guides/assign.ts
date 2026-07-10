import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";
import { ROLE_HIERARCHY } from "@lib/rbac";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || ROLE_HIERARCHY[user.role as keyof typeof ROLE_HIERARCHY] < ROLE_HIERARCHY.supervisor) {
    return jsonResponse({ error: "Acceso denegado" }, 403);
  }

  try {
    const body = await request.json();
    const recordId = Number(body.recordId);
    const invgateId = Number(body.invgate_id);

    if (!recordId || !invgateId || isNaN(recordId) || isNaN(invgateId)) {
      return jsonResponse({ error: "recordId e invgate_id son requeridos y deben ser numeros" }, 400);
    }

    const [record] = await db
      .select({ legacyName: supportGuides.legacyName })
      .from(supportGuides)
      .where(eq(supportGuides.id, recordId));

    if (!record) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    await db
      .update(supportGuides)
      .set({ invgate_id: invgateId })
      .where(eq(supportGuides.id, recordId));

    await logAdminAction(
      user.username || "sistema",
      `Asigno la mesa de ayuda "${record.legacyName || `Registro #${recordId}`}" al helpdesk de InvGate ID ${invgateId}.`,
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[assign] Error:", err);
    return jsonResponse({ error: "Error interno al asignar helpdesk" }, 500);
  }
};
