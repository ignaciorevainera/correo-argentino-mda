/**
 * Resuelve el agente operativo vinculado al usuario logueado.
 *
 * El vínculo canónico es `agents.userId`; `agents.username` queda como
 * fallback para registros legacy sin vínculo por id (mismo criterio que usa
 * el home para mostrar el nombre).
 */
import { db } from "@db/index";
import { agents, users } from "@db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { activeAgentCondition } from "@lib/activeUsers";

export interface SessionAgent {
  id: number;
  name: string;
  username: string | null;
  userId: number | null;
  incluidoCalidad: boolean;
  enCronograma: boolean;
  horarioDefault: string;
  saturdayGroup: string | null;
  saturdayHorario: string | null;
  esquemaSemanal: Record<string, string> | null;
  esquemaHorario: Record<string, string> | null;
  esquemaBreakInicio: Record<string, string> | null;
  esquemaBreakFin: Record<string, string> | null;
}

const agentSelection = {
  id: agents.id,
  name: agents.name,
  username: agents.username,
  userId: agents.userId,
  incluidoCalidad: agents.incluidoCalidad,
  enCronograma: agents.enCronograma,
  horarioDefault: agents.horarioDefault,
  saturdayGroup: agents.saturdayGroup,
  saturdayHorario: agents.saturdayHorario,
  esquemaSemanal: agents.esquemaSemanal,
  esquemaHorario: agents.esquemaHorario,
  esquemaBreakInicio: agents.esquemaBreakInicio,
  esquemaBreakFin: agents.esquemaBreakFin,
};

export async function getSessionAgent(
  user: { id: number; username?: string } | null | undefined,
): Promise<SessionAgent | null> {
  if (!user || !user.id) return null;

  const username = (user.username ?? "").trim().toLowerCase();
  const matches = [eq(agents.userId, user.id)];
  if (username) {
    // El fallback por username es sólo para registros legacy SIN vínculo por
    // id: si el agente ya está vinculado a otro usuario, no debe resolverse.
    matches.push(
      and(
        isNull(agents.userId),
        sql`lower(trim(${agents.username})) = ${username}`,
      )!,
    );
  }

  const [row] = await db
    .select(agentSelection)
    .from(agents)
    .where(or(...matches))
    // Preferir el vínculo por id si ambos matchean.
    .orderBy(sql`case when ${agents.userId} = ${user.id} then 0 else 1 end`)
    .limit(1);

  return row ?? null;
}

/**
 * Agente de ejemplo para el simulador de vista del admin: el primer operador
 * activo en cronograma. Sólo se usa cuando el usuario real es admin y está
 * simulando (el admin ya puede ver toda la operatoria).
 */
export async function getSampleAgent(): Promise<SessionAgent | null> {
  const [row] = await db
    .select(agentSelection)
    .from(agents)
    // Requerido por `activeAgentCondition()` (usa users.active).
    .leftJoin(users, eq(users.id, agents.userId))
    .where(and(eq(agents.enCronograma, true), activeAgentCondition()))
    .orderBy(agents.name)
    .limit(1);

  return row ?? null;
}
