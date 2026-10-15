import { getUnassignedTicketsByHelpdesk } from "@/lib/invgate/agsTickets";
import { AGS_HELPDESK_ID } from "@/lib/invgate/agsHelpdesk";
import { getDisponibilidadHoy } from "@lib/disponibilidad";
import {
  evaluateAllAutogestionRulesDetailed,
  executeAutoAssignment,
  AUTOGESTION_AUTOMATION_RULES,
} from "./rulesEngine";
import { getAutogestionRuleStates, resolveRuleEnabled } from "./ruleState";
import { writePersistedCache } from "@/lib/invgate/cache";

export interface AutoAssignCycleResult {
  evaluatedCount: number;
  assignedCount: number;
  assignedTickets: Array<{
    ticketId: number;
    ticketNumber: string;
    assignedTo: string;
    ruleId: string;
  }>;
  unassignedDetails?: Array<{
    ticketId: number;
    ticketNumber: string;
    reason: string;
  }>;
  errors: string[];
  lastRunAt?: number;
  skippedDueToLock?: boolean;
}

let isRunning = false;

/**
 * Consulta si hay un ciclo de autoasignación ejecutándose actualmente.
 */
export function isAutoAssignCycleRunning(): boolean {
  return isRunning;
}

/**
 * Ejecuta un ciclo completo de evaluación y asignación automática de autogestiones.
 * Implementa control de concurrencia y tolerancia a fallos para proteger la API de InvGate.
 */
export async function runAutoAssignCycle(
  authorLabel: string = "Automatización MDA"
): Promise<AutoAssignCycleResult> {
  if (isRunning) {
    console.warn("[AutoAssignRunner] Se omitió el ciclo debido a una ejecución concurrente en curso.");
    return {
      evaluatedCount: 0,
      assignedCount: 0,
      assignedTickets: [],
      errors: [],
      skippedDueToLock: true,
    };
  }

  isRunning = true;

  const result: AutoAssignCycleResult = {
    evaluatedCount: 0,
    assignedCount: 0,
    assignedTickets: [],
    errors: [],
    skippedDueToLock: false,
  };

  try {
    // 0. Reglas deshabilitadas por un supervisor: si están todas apagadas, no se
    // consulta InvGate (el ciclo no tiene nada que hacer).
    const ruleStates = await getAutogestionRuleStates();
    const disabledRules = new Set<string>(
      AUTOGESTION_AUTOMATION_RULES.filter((r) => !resolveRuleEnabled(r.id, ruleStates)).map(
        (r) => r.id
      )
    );
    if (disabledRules.size >= AUTOGESTION_AUTOMATION_RULES.length) {
      return result;
    }

    // 1. Obtener tickets sin asignar de la mesa de autogestiones
    const unassignedRes = await getUnassignedTicketsByHelpdesk(AGS_HELPDESK_ID);
    if (!unassignedRes.ok) {
      const err = `Error al consultar tickets sin asignar de InvGate: ${unassignedRes.error || "Desconocido"}`;
      console.error(`[AutoAssignRunner] ${err}`);
      result.errors.push(err);
      return result;
    }

    const tickets = unassignedRes.tickets || [];
    result.evaluatedCount = tickets.length;

    if (tickets.length === 0) {
      return result;
    }

    // 2. Obtener disponibilidad calculada en tiempo real de los operadores
    const allOperators = await getDisponibilidadHoy();
    const assignableOperators = allOperators.filter((op) => op.asignableAgs !== false);

    // 3. Evaluar reglas de automatización
    const { actionableResults: actionable, unassignedReasons } = evaluateAllAutogestionRulesDetailed(
      tickets,
      assignableOperators,
      disabledRules
    );
    result.unassignedDetails = unassignedReasons;

    // 4. Ejecutar asignaciones automáticas encontradas
    for (const ruleMatch of actionable) {
      try {
        const execRes = await executeAutoAssignment(ruleMatch, authorLabel);
        if (execRes.success) {
          result.assignedCount++;
          result.assignedTickets.push({
            ticketId: execRes.ticketId,
            ticketNumber: execRes.ticketNumber,
            assignedTo: execRes.assignedTo || "Desconocido",
            ruleId: execRes.ruleId,
          });
          console.log(
            `[AutoAssignRunner] Ticket ${execRes.ticketNumber} autoasignado con éxito a ${execRes.assignedTo} vía regla '${ruleMatch.ruleName}'`
          );
        } else if (execRes.error) {
          result.errors.push(execRes.error);
        }
      } catch (assignErr: any) {
        const msg = `Excepción al autoasignar ticket #${ruleMatch.ticketId}: ${assignErr?.message || assignErr}`;
        console.error(`[AutoAssignRunner] ${msg}`);
        result.errors.push(msg);
      }
    }

    result.lastRunAt = Date.now();
    try {
      writePersistedCache("autogestion_last_cycle_result", result, 24 * 60 * 60 * 1000);
    } catch (cErr) {
      console.warn("[AutoAssignRunner] No se pudo persistir el resultado del ciclo en cache:", cErr);
    }

    return result;
  } catch (globalErr: any) {
    const msg = `Error inesperado en ciclo de autoasignación: ${globalErr?.message || globalErr}`;
    console.error(`[AutoAssignRunner] ${msg}`);
    result.errors.push(msg);
    result.lastRunAt = Date.now();
    try {
      writePersistedCache("autogestion_last_cycle_result", result, 24 * 60 * 60 * 1000);
    } catch {}
    return result;
  } finally {
    isRunning = false;
  }
}
