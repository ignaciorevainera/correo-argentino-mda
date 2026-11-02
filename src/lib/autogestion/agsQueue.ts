/**
 * Cola de AGS: ordena operadores por "hace cuánto que no reciben una
 * autogestión" (nunca asignados primero) y elige el próximo.
 *
 * Es el mismo criterio que usa `/supervision/asignacion-autogestiones`
 * (`nextSuggestedOperators`), extraído para compartirlo con el home.
 */

export interface AgsQueueCandidate {
  agentId: number;
  nombre: string;
  disponible: boolean;
  asignableAgs?: boolean;
  lastAutogestionAssignedAt?: number | null;
}

export function isAgsQueueCandidate(op: AgsQueueCandidate): boolean {
  return op.disponible === true && op.asignableAgs !== false;
}

/**
 * Devuelve un array nuevo con los candidatos ordenados: primero los que nunca
 * recibieron una autogestión, después del más viejo al más reciente.
 */
export function sortAgsQueue<T extends AgsQueueCandidate>(operators: T[]): T[] {
  return operators.filter(isAgsQueueCandidate).sort((a, b) => {
    const aNever = a.lastAutogestionAssignedAt === null || a.lastAutogestionAssignedAt === undefined;
    const bNever = b.lastAutogestionAssignedAt === null || b.lastAutogestionAssignedAt === undefined;
    if (aNever && !bNever) return -1;
    if (!aNever && bNever) return 1;
    if (aNever && bNever) return 0;
    return (a.lastAutogestionAssignedAt as number) - (b.lastAutogestionAssignedAt as number);
  });
}
