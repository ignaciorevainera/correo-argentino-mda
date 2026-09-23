import { sql, type SQL } from "drizzle-orm";
import { users } from "@db/schema";

/**
 * Condición SQL para filtrar agentes operativos: excluye agentes cuyo usuario
 * de portal está inactivo. Los agentes sin usuario vinculado (userId NULL) o
 * sin match de username NO se excluyen (perfil puro de operador).
 *
 * Pensado para queries sobre `agents` con LEFT JOIN a `users`:
 *   db.select(...).from(agents).leftJoin(users, sql`...`)
 */
export const activeAgentCondition = (): SQL =>
  sql`(${users.active} IS NULL OR ${users.active} = 1)`;

/**
 * Condición SQL para queries sobre `users`: solo usuarios activos.
 */
export const activeUserCondition = (): SQL => sql`${users.active} = 1`;

/**
 * Excluye agentes vinculados a un usuario inactivo usando `agents.userId`.
 * Frase lista para pegar en un WHERE de queries sobre agents con join a users.
 */
export const excludeInactiveAgents = (): SQL =>
  sql`(${users.active} IS NULL OR ${users.active} = 1)`;
