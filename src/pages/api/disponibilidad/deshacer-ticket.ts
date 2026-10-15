import type { APIRoute } from "astro";
import { reassignTicketToAgent, addTicketComment, MDA_COMMENT_PREFIX } from "@lib/invgate/agsTickets";
import { AGS_HELPDESK_ID } from "@lib/invgate/agsHelpdesk";
import { getDisponibilidadHoy } from "@lib/disponibilidad";
import { db } from "@db/index";
import { agents, assignmentHistory } from "@db/schema";
import { and, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

/**
 * Restaura la rotación cíclica del operador al que se le deshizo una asignación.
 *
 * El valor previo NO sale de `agents.last_autogestion_undo`: esa columna es un
 * slot único por agente que las rutas de asignación borran globalmente, así que
 * solo conserva la última asignación del sistema. Se deriva del historial: la
 * última fila no-deshecha de este ticket identifica al operador, y la fila
 * inmediatamente anterior de ese mismo operador es el timestamp a restaurar.
 *
 * Si la asignación era de la regla P1 (solicitud rechazada), que no escribe
 * `last_autogestion_assigned_at` porque corre con skipQueueUpdate, la fila
 * anterior es la última asignación cíclica real y la restauración es un no-op:
 * el valor actual ya es ese.
 */
async function restoreCyclicRotation(agentId: number, assignedAt: number): Promise<void> {
  const [previous] = await db
    .select({ assignedAt: assignmentHistory.assignedAt })
    .from(assignmentHistory)
    .where(
      and(
        eq(assignmentHistory.agentId, agentId),
        lt(assignmentHistory.assignedAt, assignedAt)
      )
    )
    .orderBy(desc(assignmentHistory.assignedAt))
    .limit(1);

  await db
    .update(agents)
    .set({ lastAutogestionAssignedAt: previous?.assignedAt ?? null })
    .where(eq(agents.id, agentId));
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "asignacion_ag");
  if (denied) return denied;

  try {
    const { ticketNumber } = await request.json();

    if (!ticketNumber) {
      return jsonResponse({ success: false, error: "Número de ticket no provisto." }, 400);
    }

    const numericId = Number(String(ticketNumber).replace(/[^0-9]/g, ""));
    if (isNaN(numericId) || numericId <= 0) {
      return jsonResponse({ success: false, error: "ID de ticket inválido." }, 400);
    }

    const userClean = locals.user?.username ? locals.user.username.split("@")[0].toLowerCase().trim() : "";
    const list = await getDisponibilidadHoy();
    const loggedOp = list.find((op) => op.username && op.username.split("@")[0].toLowerCase().trim() === userClean);
    const authorInvgateId = loggedOp?.invgateId || 1;

    // Última asignación viva de este ticket (sin deshacer): define a quién se le
    // revierte la rotación. Sin ella el ticket se devuelve igual a la cola, pero
    // no hay operador al que restituirle su turno.
    const [currentAssignment] = await db
      .select({
        agentId: assignmentHistory.agentId,
        agentName: assignmentHistory.agentName,
        assignedAt: assignmentHistory.assignedAt,
      })
      .from(assignmentHistory)
      .where(
        and(
          inArray(assignmentHistory.ticketNumber, [`#${numericId}`, String(ticketNumber)]),
          ne(assignmentHistory.type, "undo")
        )
      )
      .orderBy(desc(assignmentHistory.assignedAt))
      .limit(1);

    // Call InvGate QA to reassign ticket to agent_id: 0 (unassigned)
    const reassignRes = await reassignTicketToAgent(numericId, 0, AGS_HELPDESK_ID, authorInvgateId);
    if (!reassignRes.ok) {
      return jsonResponse({ success: false, error: `Error al desasignar ticket #${numericId} en InvGate: ${reassignRes.message}` }, 400);
    }

    // Publicar comentario de reversión en InvGate para que no quede el comentario público
    // de asignación automática visible sin responsable asignado (Issue #288)
    try {
      const undoAuthorName = locals.user?.username || "Supervisión";
      const undoComment = `${MDA_COMMENT_PREFIX}Asignación revertida por supervisión (${undoAuthorName}). El ticket regresa a la cola sin asignar.`;
      await addTicketComment(numericId, undoComment, authorInvgateId, 1);
    } catch (cErr) {
      console.warn(`Error agregando comentario de reversión al ticket #${numericId}:`, cErr);
    }

    // Log history undo event con el operador real: el cooldown de la P1 y la
    // trazabilidad del supervisor dependen de este agentId (antes era 0).
    try {
      await db.insert(assignmentHistory).values({
        agentId: currentAssignment?.agentId ?? 0,
        agentName: currentAssignment?.agentName || "Sin Asignar",
        ticketNumber: `#${numericId}`,
        assignedBy: `Deshecho por ${locals.user?.username || "Sistema"}`,
        assignedAt: Date.now(),
        type: "undo",
      });
    } catch (hErr) {
      console.error("Error logging undo ticket history:", hErr);
    }

    if (currentAssignment) {
      try {
        await restoreCyclicRotation(currentAssignment.agentId, currentAssignment.assignedAt);
      } catch (rErr) {
        // El ticket ya volvió a la cola en InvGate: una falla al restituir la
        // rotación no debe reportarse como error del deshacer.
        console.error("Error restaurando rotación cíclica al deshacer:", rErr);
      }
    }

    return jsonResponse({ success: true, message: `Ticket #${numericId} devuelto a sin asignar.` }, 200);
  } catch (error: any) {
    console.error("POST /api/disponibilidad/deshacer-ticket Error:", error);
    return jsonResponse({ success: false, error: sanitizeError(error) }, 500);
  }
};
