import { sql, type SQL } from "drizzle-orm";
import { users } from "@db/schema";

/**
 * Condición SQL para filtrar agentes operativos: excluye agentes cuyo usuario
 * de portal está inactivo. Los agentes sin usuario vinculado (userId NULL) NO
 * se excluyen (perfil puro de operador).
 *
 * Requiere un LEFT JOIN a `users` keyed al agente por `userId`:
 *   db.select(...).from(agents).leftJoin(users, eq(users.id, agents.userId))
 *
 * Si el agente no tiene `userId`, el join deja `users.active` en NULL y la
 * condición lo conserva.
 */
export const activeAgentCondition = (): SQL =>
  sql`(${users.active} IS NULL OR ${users.active} = 1)`;

/**
 * Condición SQL para queries sobre `users`: solo usuarios activos.
 */
export const activeUserCondition = (): SQL => sql`${users.active} = 1`;
