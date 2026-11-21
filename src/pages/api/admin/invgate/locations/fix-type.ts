import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { offices, officeInvgateLinks } from "@db/schema";
import { can } from "@lib/roleConfig";
import { jsonError, jsonResponse, sanitizeError } from "@lib/apiResponse";
import { validateRequestCsrf } from "@lib/csrf";
import { logAdminFromAstro } from "@lib/auditLogger";
import { invalidateOfficeCaches } from "@lib/officeQueries";
import { inferExpectedOfficeType } from "@lib/invgate/officeTypeMismatch";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(20),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const role = locals.user?.role;
  if (!role) return jsonError("No autorizado", 401, "no-store");
  if (!can(role, "team_leader"))
    return jsonError("Sin permisos", 403, "no-store");
  if (!(await validateRequestCsrf(request, locals))) {
    return jsonError("Token CSRF inválido o ausente", 403, "no-store");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError("Cuerpo inválido", 400);

  try {
    const [row] = await db
      .select({
        id: offices.id,
        code: offices.code,
        type: offices.type,
        officeType: offices.officeType,
        invgateDisplayName: officeInvgateLinks.invgateDisplayName,
      })
      .from(offices)
      .innerJoin(
        officeInvgateLinks,
        eq(offices.id, officeInvgateLinks.officeId),
      )
      .where(eq(offices.code, parsed.data.code))
      .limit(1);

    if (!row) return jsonError("Oficina inexistente", 404);

    const expected = inferExpectedOfficeType(row.invgateDisplayName ?? "");
    if (!expected) {
      return jsonError(
        "La ubicación de InvGate no tiene un sufijo de tipo reconocido",
        422,
      );
    }

    const alreadyCorrect =
      row.type.toUpperCase() === expected.type &&
      (expected.officeType === null ||
        row.officeType?.toUpperCase() === "AUTOMATIZADA");

    if (alreadyCorrect) {
      return jsonError("La oficina ya tiene el tipo esperado", 409);
    }

    await db
      .update(offices)
      .set({
        type: expected.type,
        ...(expected.officeType ? { officeType: expected.officeType } : {}),
      })
      .where(eq(offices.id, row.id));

    invalidateOfficeCaches();
    await logAdminFromAstro(
      locals,
      `Corrigió tipo de oficina ${row.code}: ${row.type} → ${expected.type}`,
    );

    return jsonResponse({
      success: true,
      code: row.code,
      before: { type: row.type, officeType: row.officeType },
      after: {
        type: expected.type,
        officeType: expected.officeType ?? row.officeType,
      },
    });
  } catch (error) {
    return jsonError(
      sanitizeError(error, "Error al corregir el tipo de oficina"),
      500,
    );
  }
};
