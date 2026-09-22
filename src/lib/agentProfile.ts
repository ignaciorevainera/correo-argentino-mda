// src/lib/agentProfile.ts
// Resolución de la fila agents vinculada a un usuario, con adopción de
// shells huérfanos (user_id NULL) por nombre visible case-insensitive.
import { and, eq, isNull, sql } from "drizzle-orm";
import { agents } from "@db/schema";
import { db } from "@db/index";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AgentProfile = typeof agents.$inferSelect;

/** Fila agents vinculada exactamente al usuario. */
export function findAgentByUserId(tx: Tx, userId: number): AgentProfile | undefined {
  return tx.select().from(agents).where(eq(agents.userId, userId)).get();
}

/**
 * Shell huérfano (sin usuario) cuyo nombre visible coincide,
 * case-insensitive. Preserva historial al adoptarlo (misma fila, mismo id).
 */
export function findUnlinkedAgentByName(tx: Tx, name: string): AgentProfile | undefined {
  return tx
    .select()
    .from(agents)
    .where(and(sql`lower(${agents.name}) = ${name.trim().toLowerCase()}`, isNull(agents.userId)))
    .get();
}
