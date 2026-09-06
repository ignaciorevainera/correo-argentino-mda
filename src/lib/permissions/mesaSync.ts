// src/lib/permissions/mesaSync.ts
import { db } from "../../db";
import { mesas } from "../../db/schema";
import { inArray, eq } from "drizzle-orm";
import type { InvgateResult } from "@/types/invgate";

export type InvGateMesa = {
  invgateId: number;
  name: string;
  displayName?: string | null;
};

export type MesaDiff = {
  added: Array<{ invgateId: number; name: string; displayName: string | null }>;
  updated: Array<{
    invgateId: number;
    name: string;
    displayName: string | null;
    wasActive: boolean;
  }>;
  deactivated: number[];
};

export function diffMesas(
  invGateList: InvGateMesa[],
  local: Array<{ invgateId: number; name: string; displayName: string | null; active: boolean }>,
): MesaDiff {
  // Dedupe by invgateId (keep first) so a duplicate in the InvGate response
  // cannot produce two added/updated rows for the same unique column.
  const seen = new Set<number>();
  const uniqueList = invGateList.filter((m) => {
    if (seen.has(m.invgateId)) return false;
    seen.add(m.invgateId);
    return true;
  });

  const localById = new Map(local.map((m) => [m.invgateId, m]));
  const added: MesaDiff["added"] = [];
  const updated: MesaDiff["updated"] = [];

  for (const ig of uniqueList) {
    const existing = localById.get(ig.invgateId);
    if (!existing) {
      added.push({ invgateId: ig.invgateId, name: ig.name, displayName: ig.displayName ?? null });
    } else if (existing.name !== ig.name || existing.displayName !== (ig.displayName ?? null)) {
      updated.push({
        invgateId: ig.invgateId,
        name: ig.name,
        displayName: ig.displayName ?? null,
        wasActive: existing.active,
      });
    }
  }

  const invGateIds = new Set(invGateList.map((m) => m.invgateId));
  const deactivated = local
    .filter((m) => !invGateIds.has(m.invgateId) && m.active)
    .map((m) => m.invgateId);

  return { added, updated, deactivated };
}

// Mesas ("mesas de ayuda") map to InvGate **helpdesks** (confirmed by existing
// usage in src/pages/api/invgate/helpdesk-search.ts and src/pages/api/usuarios/
// invgate-user.ts, both calling invgateGet<InvgateHelpdesk[]>("helpdesks")).
// `invgateGet` returns the parsed body directly in `result.data` (no wrapper),
// a plain array of { id, name } — no display_name field exists on helpdesks.
export async function fetchInvGateMesas(): Promise<InvGateMesa[]> {
  const { invgateGet } = await import("../invgateClient");
  const result = await invgateGet<{ id: number; name: string }[]>("helpdesks");
  if (!result.ok || !("data" in result)) {
    const message = "message" in result ? result.message : "Sin datos de InvGate";
    throw new Error(`[mesaSync] Error al obtener mesas de InvGate: ${message}`);
  }
  const rawList = result.data;
  if (!Array.isArray(rawList)) {
    throw new Error("[mesaSync] La respuesta de helpdesks de InvGate no es un array.");
  }
  return rawList.map((h) => ({
    invgateId: h.id,
    name: h.name,
    displayName: null,
  }));
}

export async function syncMesas(): Promise<{
  added: number;
  updated: number;
  deactivated: number;
  total: number;
}> {
  const invGateList = await fetchInvGateMesas();

  // Guard against an accidental wipe: a legitimate-but-empty InvGate response
  // (or a flaky 200 with no data) must NOT soft-deactivate every local mesa.
  if (invGateList.length === 0) {
    throw new Error(
      "[mesaSync] InvGate devolvió 0 mesas; se cancela el sync para evitar desactivar todas las mesas locales.",
    );
  }

  const localRows = await db.select().from(mesas);
  const diff = diffMesas(
    invGateList,
    localRows.map((m) => ({
      invgateId: m.invgateId,
      name: m.name,
      displayName: m.displayName,
      active: m.active,
    })),
  );
  const now = new Date().toISOString();

  // better-sqlite3 commits synchronously when the callback returns, so the
  // transaction callback MUST be synchronous (no async/await inside) — otherwise
  // inserts run after the commit and lose atomicity. Use .run() per statement.
  db.transaction((tx) => {
    for (const a of diff.added) {
      tx.insert(mesas)
        .values({
          invgateId: a.invgateId,
          name: a.name,
          displayName: a.displayName,
          active: true,
          lastSyncedAt: now,
        })
        .run();
    }
    for (const u of diff.updated) {
      tx.update(mesas)
        .set({ name: u.name, displayName: u.displayName, active: true, lastSyncedAt: now })
        .where(eq(mesas.invgateId, u.invgateId))
        .run();
    }
    if (diff.deactivated.length > 0) {
      tx.update(mesas)
        .set({ active: false, lastSyncedAt: now })
        .where(inArray(mesas.invgateId, diff.deactivated))
        .run();
    }
  });

  return {
    added: diff.added.length,
    updated: diff.updated.length,
    deactivated: diff.deactivated.length,
    total: invGateList.length,
  };
}
