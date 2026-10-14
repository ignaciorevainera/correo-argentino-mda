import type { APIRoute } from "astro";
import { db } from "@db/index";
import { qualityAudits } from "@db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";

/**
 * Guarda el orden manual de las tarjetas de auditoría del panel de detalle
 * (numeración 1..4 por canal). Recibe `items: [{ id, sortOrder }]`.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const perm = await requireWriteAccess(locals, "calidad");
  if (perm) return perm;

  let items: Array<{ id?: unknown; sortOrder?: unknown }>;
  try {
    const body = await request.json();
    items = body?.items;
    if (!Array.isArray(items)) return jsonError("Datos inválidos", 400);
  } catch {
    return jsonError("Datos inválidos", 400);
  }

  const updates = items
    .map((item) => ({
      id: Number(item.id),
      sortOrder: Number(item.sortOrder),
    }))
    .filter((item) => Number.isInteger(item.id) && Number.isFinite(item.sortOrder));

  if (updates.length === 0) return jsonError("Datos inválidos", 400);

  try {
    db.transaction((tx) => {
      for (const item of updates) {
        tx.update(qualityAudits)
          .set({ sortOrder: item.sortOrder })
          .where(eq(qualityAudits.id, item.id))
          .run();
      }
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[reorder-audits] Error:", error);
    return jsonError("Error interno al reordenar", 500);
  }
};