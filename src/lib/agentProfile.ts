// src/lib/agentProfile.ts
// Resolución de la fila agents vinculada a un usuario, con adopción de
// shells huérfanos (user_id NULL) por nombre visible case-insensitive.
import { eq, isNull } from "drizzle-orm";
import { agents } from "@db/schema";
import type { db } from "@db/index";
import { normalizeName } from "@lib/scheduleLinks";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = Tx | typeof db;

export type AgentProfile = typeof agents.$inferSelect;

/**
 * Usar dentro de db.transaction() para que lectura+adopción sean atómicos.
 * Fila agents vinculada exactamente al usuario.
 */
export function findAgentByUserId(tx: DbLike, userId: number): AgentProfile | undefined {
  return tx.select().from(agents).where(eq(agents.userId, userId)).get();
}

/**
 * Usar dentro de db.transaction() para que lectura+adopción sean atómicos.
 * Shell huérfano (sin usuario) cuyo nombre visible coincide,
 * case-insensitive. Preserva historial al adoptarlo (misma fila, mismo id).
 * Prefilter barato en SQL (shells huérfanos son pocos); match completo
 * en JS porque SQLite lower() es ASCII-only y no normaliza whitespace.
 * Primer match determinístico por id.
 */
export function findUnlinkedAgentByName(tx: DbLike, name: string): AgentProfile | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  const candidates = tx
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(isNull(agents.userId))
    .orderBy(agents.id)
    .all();
  const match = candidates.find((row) => normalizeName(row.name) === target);
  if (!match) return undefined;
  return tx.select().from(agents).where(eq(agents.id, match.id)).get();
}
