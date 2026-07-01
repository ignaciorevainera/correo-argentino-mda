import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { logAdminAction } from "@lib/auditLogger";

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonError("No autenticado", 401);
  }

  const { dni } = params;
  if (!dni) {
    return jsonError("DNI del usuario requerido", 400);
  }

  try {
    const body = await request.json();
    const { interno, telefono, sucursal } = body;

    const existing = await db
      .select()
      .from(employees)
      .where(eq(employees.dni, dni))
      .limit(1);

    if (existing.length === 0) {
      return jsonError("Usuario no encontrado", 404);
    }

    await db
      .update(employees)
      .set({
        ...(interno !== undefined && { interno: interno || null }),
        ...(telefono !== undefined && { telefono: telefono || null }),
        ...(sucursal !== undefined && { sucursal: sucursal || null }),
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(employees.dni, dni));

    await logAdminAction(
      locals.user.username || "Sistema",
      `Actualizó datos de contacto del empleado ${existing[0].fullname} (${dni})`,
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[UserUpdate] Error:", error);
    return jsonError("Error al actualizar el usuario", 500);
  }
};
