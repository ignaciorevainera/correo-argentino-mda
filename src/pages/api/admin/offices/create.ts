import type { APIRoute } from "astro";
import { can } from "@lib/roleConfig";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { db } from "@db/index";
import { offices } from "@db/schema";
import { officeFormSchema } from "@lib/validations";
import { normalizeSearchValue } from "@lib/clientSearch";
import { logAdminFromAstro } from "@lib/auditLogger";

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "admin")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  try {
    const body = await request.json();
    const { code, name, type, officeType, provinceCode, address, cc } = body;

    let finalType = type;
    let finalOfficeType = officeType || null;
    if (type === "SUCURSAL_AUTOMATIZADA") {
      finalType = "SUCURSAL";
      finalOfficeType = "AUTOMATIZADA";
    } else if (type === "SUCURSAL_NO_AUTOMATIZADA") {
      finalType = "SUCURSAL";
      finalOfficeType = "NO_AUTOMATIZADA";
    }

    const parsed = officeFormSchema.safeParse({
      code,
      name,
      type: finalType,
      officeType: finalOfficeType,
      provinceCode,
      address,
      ccAdmin: cc || null,
    });

    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
      return jsonResponse({ error: errorMsg }, 400);
    }

    const searchableText = normalizeSearchValue(
      [parsed.data.code, parsed.data.name, parsed.data.address]
        .filter(Boolean)
        .join(" ")
    );

    await db.insert(offices).values({
      ...parsed.data,
      searchableText,
    });

    await logAdminFromAstro(locals,
      `Creó la oficina "${parsed.data.name}" (NIS ${parsed.data.code}) desde la sincronización de ubicaciones`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("UNIQUE constraint failed") || errorMsg.includes("UNIQUE")) {
      return jsonResponse({ error: "El NIS o Código ya existe en la base de datos" }, 400);
    }
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
