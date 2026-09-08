import type { APIRoute } from "astro";
import { db } from "@db/index";
import { hiddenHelpdesks } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";
import { ROLE_HIERARCHY } from "@lib/rbac";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (
    !user ||
    ROLE_HIERARCHY[user.role as keyof typeof ROLE_HIERARCHY] <
      ROLE_HIERARCHY.admin
  ) {
    return jsonResponse({ error: "Acceso denegado" }, 403);
  }

  try {
    const body = await request.json();
    const invgateId = Number(body.invgate_id);

    if (!invgateId || isNaN(invgateId)) {
      return jsonResponse(
        { error: "invgate_id es requerido y debe ser un numero" },
        400,
      );
    }

    await db
      .delete(hiddenHelpdesks)
      .where(eq(hiddenHelpdesks.invgateId, invgateId));

    await logAdminAction(
      user.username || "sistema",
      `Mostro la mesa de ayuda ID ${invgateId}.`,
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[show] Error:", err);
    return jsonResponse({ error: "Error interno al mostrar helpdesk" }, 500);
  }
};
