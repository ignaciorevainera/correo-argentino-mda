import { db } from "@db/index";
import { agents, assignmentHistory } from "@db/schema";
import { eq } from "drizzle-orm";
import {
  reassignTicketToAgent,
  addTicketComment,
  invalidateUnassignedTicketsCache,
  MDA_COMMENT_PREFIX,
} from "@/lib/invgate/agsTickets";
import { AGS_HELPDESK_ID } from "@/lib/invgate/agsHelpdesk";
import type { AgentDisponibilidad } from "@lib/disponibilidad";
import type {
  AutogestionRuleDoc,
  RuleEvaluationResult,
  AutoAssignmentExecutionResult,
} from "./types";
import { evaluateRejectedRequestRule } from "./rules/rejectedRequestRule";
import { evaluateGeneralCyclicRule } from "./rules/generalCyclicRule";

export { evaluateRejectedRequestRule, evaluateGeneralCyclicRule };

/**
 * IDs canónicos de las automatizaciones de AGS. El engine las cablea por
 * precedencia (P1 antes que P2) y el toggle de la UI las usa para apagar reglas.
 */
export const RULE_IDS = {
  rejected: "solicitud_rechazada",
  cyclic: "asignacion_ciclica_general",
} as const;

/**
 * Catálogo documental de automatizaciones programadas para la asignación de autogestiones.
 * Utilizado para informar a los supervisores en la interfaz de usuario con orden de prioridad.
 *
 * OJO: `status` es el estado por DEFAULT, no el estado real. El estado real vive
 * en la tabla `autogestion_rule_state` (ver `ruleState.ts`).
 *
 * Las reglas arrancan en `inactive` a propósito: un despliegue con el catálogo
 * en `active` asigna tickets reales apenas alguien levanta la app. Encenderlas
 * es una decisión operativa explícita (toggle del supervisor o fila en la tabla),
 * no el estado inicial de un fresh install.
 */
export const AUTOGESTION_AUTOMATION_RULES: AutogestionRuleDoc[] = [
  {
    id: "solicitud_rechazada",
    priority: 1,
    name: "Devolución de Solicitudes Rechazadas",
    description:
      "Asigna de manera autónoma al operador creador aquellos tickets que ingresan a la mesa con la categoría 'Solicitudes rechazadas en revisión', permitiendo que el operador subsane o complete la gestión de forma inmediata. Si el creador no es un operador disponible, el ticket pasa a la Asignación Cíclica General.",
    status: "inactive",
    intervalMinutes: 10,
    triggerEvent: "Sondeo automático cada 10 minutos (Prioridad 1)",
    conditions: [
      {
        label: "Categoría del Ticket",
        description: "El ticket debe pertenecer a la categoría 'Solicitudes rechazadas en revisión' (el nombre se compara sin tildes y admitiendo singular o plural).",
        required: true,
      },
      {
        label: "Creador Operador MDA",
        description: "El usuario que generó el ticket debe ser un operador registrado en la Mesa de Ayuda.",
        required: true,
      },
      {
        label: "Disponibilidad en Tiempo Real",
        description: "El operador debe encontrarse dentro de su horario de jornada, sin break activo y con estado disponible.",
        required: true,
      },
      {
        label: "Asignable a Autogestiones",
        description: "El operador debe tener activo el atributo asignable para la cola de autogestiones.",
        required: true,
      },
    ],
    effect:
      "El ticket se reasigna automáticamente en InvGate al operador creador con una nota de verificación y registro auditable en historial. No retrasa ni altera la posición del operador en la ronda cíclica general (skipQueueUpdate).",
    updatedAt: "2026-09-29",
  },
  {
    id: "asignacion_ciclica_general",
    priority: 2,
    name: "Asignación Cíclica de Nuevas Autogestiones",
    description:
      "Actúa como regla comodín: reparte cualquier autogestión que quede sin asignar al operador disponible que encabeza la fila de espera cíclica (mayor tiempo sin recibir AGS o sin asignaciones previas hoy), incluida una 'Solicitud rechazada en revisión' que la regla de Devolución no pudo devolver a su creador.",
    status: "inactive",
    intervalMinutes: 10,
    triggerEvent: "Sondeo automático cada 10 minutos (Prioridad 2, posterior a Solicitudes Rechazadas)",
    conditions: [
      {
        label: "Cualquier Categoría (comodín)",
        description: "Cualquier ticket de la mesa de autogestiones al que la regla de Devolución no le haya asignado un dueño: nuevas solicitudes, categorías generales, tickets de operadores MDA y también solicitudes rechazadas cuyo creador no es un operador disponible (o cuando la regla de Devolución está apagada).",
        required: true,
      },
      {
        label: "Turno en Cola Cíclica",
        description: "Operador disponible y asignable que encabeza la fila de espera cíclica (menor timestamp o sin asignación hoy).",
        required: true,
      },
      {
        label: "Disponibilidad en Tiempo Real",
        description: "El operador debe encontrarse en jornada laboral, sin break activo y con estado disponible.",
        required: true,
      },
      {
        label: "Asignable a Autogestiones",
        description: "El operador debe tener activo el atributo asignable para la cola de autogestiones.",
        required: true,
      },
    ],
    effect:
      "El ticket se reasigna en InvGate al próximo operador en cola, publica la nota pública 'Se asigna para su gestión.' y actualiza su último tiempo de asignación en base de datos rotando su turno hacia el final de la fila de espera.",
    updatedAt: "2026-09-29",
  },
];

/**
 * Evalúa una lista de tickets sin asignar aplicando precedencia estricta de reglas:
 * 1. Primero evalúa y asigna todas las solicitudes rechazadas a sus respectivos creadores.
 * 2. Los tickets restantes se distribuyen en cascada entre los operadores disponibles por turno cíclico
 *    (un ticket por operador disponible por ciclo hasta agotar tickets o disponibilidad).
 */
export function evaluateAllAutogestionRulesDetailed(
  tickets: Array<{
    id: number;
    pretty_id?: string;
    category_name?: string;
    category_last_name?: string;
    creator_id?: number;
    creator_username?: string;
    creator_name?: string;
  }>,
  allOperators: AgentDisponibilidad[],
  disabledRules: Set<string> = new Set()
): {
  actionableResults: RuleEvaluationResult[];
  unassignedReasons: Array<{ ticketId: number; ticketNumber: string; reason: string }>;
} {
  const actionableResults: RuleEvaluationResult[] = [];
  const assignedAgentIdsInCycle = new Set<number>();
  const unhandledTickets: typeof tickets = [];
  const reasonsMap = new Map<number, { ticketNumber: string; reason: string }>();

  // Paso 1: Precedencia estricta - Evaluar regla 1 (Solicitudes rechazadas en revisión)
  const p1Disabled = disabledRules.has(RULE_IDS.rejected);
  for (const ticket of tickets) {
    if (!p1Disabled) {
      const eligibleForP1 = allOperators.filter((op) => !assignedAgentIdsInCycle.has(op.agentId));
      const rejectedEval = evaluateRejectedRequestRule(ticket, eligibleForP1);
      if (rejectedEval.canAssign && rejectedEval.targetOperator) {
        rejectedEval.skipQueueUpdate = true;
        actionableResults.push(rejectedEval);
        assignedAgentIdsInCycle.add(rejectedEval.targetOperator.agentId);
        continue;
      } else if (rejectedEval.reason) {
        reasonsMap.set(ticket.id, {
          ticketNumber: ticket.pretty_id || `#${ticket.id}`,
          reason: rejectedEval.reason,
        });
      }
    }
    unhandledTickets.push(ticket);
  }

  // Paso 2: Evaluar regla 2 (Asignación cíclica general en cascada sobre los tickets restantes)
  if (!disabledRules.has(RULE_IDS.cyclic)) {
    for (const ticket of unhandledTickets) {
      const availableOperatorsForCyclic = allOperators.filter(
        (op) => !assignedAgentIdsInCycle.has(op.agentId)
      );
      if (availableOperatorsForCyclic.length === 0) {
        reasonsMap.set(ticket.id, {
          ticketNumber: ticket.pretty_id || `#${ticket.id}`,
          reason: "No quedan operadores disponibles en cola cíclica en este ciclo.",
        });
        continue;
      }

      const cyclicEval = evaluateGeneralCyclicRule(ticket, availableOperatorsForCyclic, {
        includeRejected: true,
      });
      if (cyclicEval.canAssign && cyclicEval.targetOperator) {
        actionableResults.push(cyclicEval);
        assignedAgentIdsInCycle.add(cyclicEval.targetOperator.agentId);
        reasonsMap.delete(ticket.id);
      } else if (cyclicEval.reason) {
        reasonsMap.set(ticket.id, {
          ticketNumber: ticket.pretty_id || `#${ticket.id}`,
          reason: cyclicEval.reason,
        });
      }
    }
  }

  const assignedTicketIds = new Set(actionableResults.map((r) => r.ticketId));
  const unassignedReasons = Array.from(reasonsMap.entries())
    .filter(([id]) => !assignedTicketIds.has(id))
    .map(([ticketId, data]) => ({ ticketId, ...data }));

  return { actionableResults, unassignedReasons };
}

export function evaluateAllAutogestionRules(
  tickets: Array<{
    id: number;
    pretty_id?: string;
    category_name?: string;
    category_last_name?: string;
    creator_id?: number;
    creator_username?: string;
    creator_name?: string;
  }>,
  allOperators: AgentDisponibilidad[],
  disabledRules: Set<string> = new Set()
): RuleEvaluationResult[] {
  return evaluateAllAutogestionRulesDetailed(tickets, allOperators, disabledRules).actionableResults;
}

/**
 * Ejecuta la asignación automática en InvGate y la base de datos local
 * siguiendo las políticas de preservación de cola cíclica y registro de auditoría.
 */
export async function executeAutoAssignment(
  evaluation: RuleEvaluationResult,
  authorName: string = "Automatización MDA"
): Promise<AutoAssignmentExecutionResult> {
  const { ticketId, ticketNumber, targetOperator, ruleId, ruleName, skipQueueUpdate, customComment } = evaluation;

  if (!targetOperator || !targetOperator.invgateId) {
    return {
      success: false,
      ticketId,
      ticketNumber,
      ruleId,
      error: "No se proporcionó un operador de destino válido con ID de InvGate.",
    };
  }

  const targetInvgateId = targetOperator.invgateId;
  const authorId = targetInvgateId || 1;

  try {
    // 1. Reasignar ticket en la mesa de autogestiones
    const reassignRes = await reassignTicketToAgent(ticketId, targetInvgateId, AGS_HELPDESK_ID, authorId);
    if (!reassignRes.ok) {
      return {
        success: false,
        ticketId,
        ticketNumber,
        ruleId,
        error: `Error al reasignar ticket en InvGate: ${reassignRes.message}`,
      };
    }

    // 2. Publicar comentario automático aclaratorio
    try {
      const commentMessage =
        MDA_COMMENT_PREFIX +
        (customComment ||
          (ruleId === "asignacion_ciclica_general"
            ? "Se asigna para su gestión."
            : `Asignado automáticamente por regla de autogestión: ${ruleName}. Para su correspondiente subsanación y verificación.`));
      await addTicketComment(ticketId, commentMessage, authorId, 1);
    } catch (commentErr: any) {
      console.warn(
        `[AutoAssignment] No se pudo agregar comentario explicativo al ticket #${ticketId}:`,
        commentErr?.message || commentErr
      );
    }

    const now = Date.now();

    // 3. Si la regla requiere rotar la cola (skipQueueUpdate === false), actualizar timestamp en agents
    if (skipQueueUpdate === false) {
      try {
        const [targetAgentRow] = await db
          .select({ lastAutogestionAssignedAt: agents.lastAutogestionAssignedAt })
          .from(agents)
          .where(eq(agents.id, targetOperator.agentId));
        const prevValue = targetAgentRow?.lastAutogestionAssignedAt ?? null;

        await db
          .update(agents)
          .set({
            lastAutogestionAssignedAt: now,
            lastAutogestionAssignedBy: `${authorName} (${ruleName})`,
            lastAutogestionUndo: prevValue,
          })
          .where(eq(agents.id, targetOperator.agentId));
      } catch (dbErr) {
        console.error(
          `[AutoAssignment] Error al actualizar tiempo de asignación en agents para ID ${targetOperator.agentId}:`,
          dbErr
        );
      }
    }

    // 4. Registrar auditoría en historial (tipo 'automatica')
    try {
      await db.insert(assignmentHistory).values({
        agentId: targetOperator.agentId,
        agentName: targetOperator.nombre,
        ticketNumber: ticketNumber || `#${ticketId}`,
        assignedBy: `${authorName} (${ruleName})`,
        assignedAt: now,
        type: "automatica",
      });
    } catch (histErr) {
      console.error("[AutoAssignment] Error guardando historial de asignación automática:", histErr);
    }

    // 5. Invalidar caché en memoria de tickets sin asignar
    invalidateUnassignedTicketsCache();

    return {
      success: true,
      ticketId,
      ticketNumber,
      assignedTo: targetOperator.nombre,
      agentId: targetOperator.agentId,
      ruleId,
    };
  } catch (error: any) {
    console.error(`[AutoAssignment] Excepción al ejecutar asignación para ticket #${ticketId}:`, error);
    return {
      success: false,
      ticketId,
      ticketNumber,
      ruleId,
      error: error?.message || "Error desconocido al procesar la asignación automática.",
    };
  }
}
