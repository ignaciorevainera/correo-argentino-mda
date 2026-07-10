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

    if (!recordId || isNaN(recordId)) {
      return jsonResponse({ error: "recordId es requerido y debe ser un numero" }, 400);
    }

    const [record] = await db
      .select({ helpDeskName: supportGuides.helpDeskName })
      .from(supportGuides)
      .where(eq(supportGuides.id, recordId));

    if (!record) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    await db
      .update(supportGuides)
      .set({ invgate_id: null })
      .where(eq(supportGuides.id, recordId));

    await logAdminAction(
      user.username || "sistema",
      `Desvinculo la mesa de ayuda "${record.helpDeskName}".`,
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[unassign] Error:", err);
    return jsonResponse({ error: "Error interno al desvincular helpdesk" }, 500);
  }
};
