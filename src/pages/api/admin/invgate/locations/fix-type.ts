import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
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
  if (!can(role, "supervisor"))
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

    const expected = inferExpectedOfficeType(
      row.invgateDisplayName ?? "",
      row.type,
    );
    if (!expected) {
      return jsonError(
        "La ubicación de InvGate no tiene un sufijo de tipo reconocido",
        422,
      );
    }

    const targetOfficeType =
      expected.reason === "age"
        ? null
        : (expected.officeType ?? row.officeType);
    const currentOfficeType = row.officeType?.toUpperCase() ?? null;
    const alreadyCorrect =
      row.type.toUpperCase() === expected.type &&
      (expected.reason === "age"
        ? row.officeType === null
        : expected.reason === "suc_mosaic"
          ? currentOfficeType === "AUTOMATIZADA"
          : true);

    if (alreadyCorrect) {
      return jsonError("La oficina ya tiene el tipo esperado", 409);
    }

    const updateResult = await db
      .update(offices)
      .set({
        type: expected.type,
        ...(targetOfficeType !== row.officeType
          ? { officeType: targetOfficeType }
          : {}),
      })
      .where(
        and(
          eq(offices.id, row.id),
          eq(offices.type, row.type),
          row.officeType === null
            ? isNull(offices.officeType)
            : eq(offices.officeType, row.officeType),
        ),
      )
      .run();

    if (updateResult.changes === 0) {
      return jsonError(
        "La oficina cambió mientras se corregía; recargá e intentá de nuevo",
        409,
      );
    }

    invalidateOfficeCaches();
    await logAdminFromAstro(
      locals,
      `Corrigió tipo de oficina ${row.code}: ${row.type}/${row.officeType ?? "sin officeType"} → ${expected.type}/${targetOfficeType ?? "sin officeType"}`,
    );

    return jsonResponse({
      success: true,
      code: row.code,
      before: { type: row.type, officeType: row.officeType },
      after: {
        type: expected.type,
        officeType: targetOfficeType,
      },
    });
  } catch (error) {
    return jsonError(
      sanitizeError(error, "Error al corregir el tipo de oficina"),
      500,
    );
  }
};
