import type { APIRoute } from "astro";
import { jsonError, jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import { isSectionVisibleSync } from "@lib/helpdeskAccess";
import { normalizeRole } from "@lib/rbac";
import { getDisponibilidadHoy } from "@lib/disponibilidad";
import { sortAgsQueue } from "@lib/autogestion/agsQueue";

/** Operadores de la cola que devuelve el endpoint (variante grande del home). */
const AGS_QUEUE_PREVIEW = 5;

/**
 * Cola de AGS para el home: `next` (variante compacta) y `queue` con los
 * primeros operadores (variante grande).
 *
 * Mismo criterio que `/supervision/asignacion-autogestiones`: operadores de la
 * mesa de autogestiones, asignables, disponibles, ordenados por la asignación
 * más vieja (nunca asignados primero).
 */
export const GET: APIRoute = async ({ locals }) => {
  const denied = await requireReadAccess(locals, "asignacion_ag");
  if (denied) return denied;

  const user = locals.user;
  if (
    !isSectionVisibleSync(
      user.helpdeskName,
      normalizeRole(user.role),
      "/supervision/asignacion-autogestiones",
    )
  ) {
    return jsonError("Acceso no autorizado", 403, "no-store");
  }

  try {
    const operators = (await getDisponibilidadHoy()).filter(
      (op) => op.asignableAgs,
    );
    const queue = sortAgsQueue(operators);

    const toEntry = (op: (typeof queue)[number]) => ({
      agentId: op.agentId,
      name: op.nombre,
      modality: op.modalidadHoy ?? null,
      status: op.disponible ? "Disponible" : (op.motivo ?? "No disponible"),
      available: op.disponible,
      lastAssignedAt: op.lastAutogestionAssignedAt ?? null,
    });

    const next = queue[0] ?? null;

    return jsonResponse(
      {
        next: next ? toEntry(next) : null,
        // Cola ordenada para la variante grande del home (hasta 5 operadores).
        queue: queue.slice(0, AGS_QUEUE_PREVIEW).map(toEntry),
        availableCount: queue.length,
        generatedAt: new Date().toISOString(),
      },
      200,
      "no-store, no-cache, must-revalidate",
    );
  } catch (error) {
    console.error("GET /api/ags/next error:", error);
    return jsonError(sanitizeError(error), 500, "no-store");
  }
};
