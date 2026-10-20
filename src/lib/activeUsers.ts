import { and, eq, sql, type SQL } from "drizzle-orm";
import { agents, users } from "@db/schema";

/**
 * Condición SQL para filtrar agentes operativos: excluye agentes cuyo usuario
 * de portal está inactivo. El match es por `agents.userId` (LEFT JOIN `users`
 * ON `users.id = agents.userId`). Un agente con `userId` NULL (sin usuario
 * vinculado) produce `users.active IS NULL` en el LEFT JOIN y se trata como
 * activo (se preserva); no se matchea por username.
 *
 * Pensado para queries sobre `agents` con LEFT JOIN a `users`:
 *   db.select(...).from(agents).leftJoin(users, eq(users.id, agents.userId))
 */
export const activeAgentCondition = (): SQL =>
  sql`(${users.active} IS NULL OR ${users.active} = 1)`;

/**
 * Condición SQL para queries sobre `users`: solo usuarios activos.
 */
export const activeUserCondition = (): SQL => sql`${users.active} = 1`;

/**
 * Condición para agentes que deben figurar en el cronograma: `enCronograma`
 * activo y usuario de portal activo (o sin usuario vinculado). Usar siempre
 * con LEFT JOIN a `users` (`eq(users.id, agents.userId)`).
 */
export const activeCronogramaAgentCondition = (): SQL =>
  and(eq(agents.enCronograma, true), activeAgentCondition())!;
