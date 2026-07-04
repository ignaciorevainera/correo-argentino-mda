import type { APIRoute } from "astro";
import { db } from "@db/index";
import { technologyReferents, regions } from "@db/schema";
import { eq } from "drizzle-orm";
import { isAllowed } from "@lib/rolesMatrix";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, jsonError } from "@lib/apiResponse";

const handler: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || user.id === 0) {
    return jsonError("No autenticado", 401);
  }

  if (!isAllowed("Administrar Contenido", user.role)) {
    return jsonError("No autorizado", 403);
  }

  try {
    const body = await request.json();
    const { regionId, referents } = body;

    if (!regionId || !Array.isArray(referents)) {
      return jsonError("Datos inválidos: se requiere regionId y un array de referentes", 400);
    }

    // Verify if regionId exists
    const regionExists = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.id, regionId))
      .limit(1);

    if (regionExists.length === 0) {
      return jsonError("ID de región inválido", 400);
    }

    // Validate and sanitize referents
    const sanitizedReferents: { firstName: string; lastName: string }[] = [];
    for (const ref of referents) {
      if (typeof ref.firstName !== "string" || typeof ref.lastName !== "string") {
        return jsonError("Formato de referentes inválido", 400);
      }
      const firstName = ref.firstName.trim();
      const lastName = ref.lastName.trim();
      if (!firstName || !lastName) {
        return jsonError("El nombre y apellido no pueden estar vacíos", 400);
      }
      sanitizedReferents.push({ firstName, lastName });
    }

    await db.transaction((tx) => {
      tx.delete(technologyReferents)
        .where(eq(technologyReferents.regionId, regionId))
        .run();

      if (sanitizedReferents.length > 0) {
        const insertValues = sanitizedReferents.map((ref) => ({
          regionId,
          firstName: ref.firstName,
          lastName: ref.lastName,
        }));
        tx.insert(technologyReferents)
          .values(insertValues)
          .run();
      }
    });

    await logAdminFromAstro(locals,
      `Actualizó los referentes tecnológicos de la región ${regionId}`
    );

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("Error updating technology referents:", error);
    return jsonError("Error al guardar los referentes", 500);
  }
};

export const POST: APIRoute = handler;
export const PUT: APIRoute = handler;
