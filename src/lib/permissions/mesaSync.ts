// src/lib/permissions/mesaSync.ts
import { db } from "../../db";
import { mesas } from "../../db/schema";
import { inArray } from "drizzle-orm";
import { invalidatePermissionsCache } from "./cache";
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
  const localById = new Map(local.map((m) => [m.invgateId, m]));
  const added: MesaDiff["added"] = [];
  const updated: MesaDiff["updated"] = [];

  for (const ig of invGateList) {
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

// TODO: confirm InvGate categories endpoint + response shape.
// This repo calls InvGate via `invgateGet<T>(endpoint)` (src/lib/invgateClient.ts),
// where endpoint is a relative resource path (e.g. "helpdesks", "kb.categories").
// The plan assumed `/api/v1/sd/categories?type=helpdesk` returning { categories: [...] }.
// Mesas ("mesas de ayuda") in this app map to InvGate helpdesks, so the real endpoint
// may be `helpdesks` (returns an array directly) instead of `sd.categories?type=helpdesk`.
// The mapping below is resilient to both shapes.
export async function fetchInvGateMesas(): Promise<InvGateMesa[]> {
  const { invgateGet } = await import("../invgateClient");
  const result = await invgateGet<any>("sd.categories?type=helpdesk");
  if (!result.ok || !("data" in result)) {
    const message = "message" in result ? result.message : "Sin datos de InvGate";
    throw new Error(`[mesaSync] Error al obtener mesas de InvGate: ${message}`);
  }
  const payload = result.data;
  const rawList: any[] = payload?.categories ?? payload?.data ?? payload ?? [];
  if (!Array.isArray(rawList)) {
    throw new Error("[mesaSync] La respuesta de categorías de InvGate no es un array.");
  }
  return rawList.map((c: any) => ({
    invgateId: c.id,
    name: c.name,
    displayName: c.display_name ?? null,
  }));
}

export async function syncMesas(): Promise<{
  added: number;
  updated: number;
  deactivated: number;
  total: number;
}> {
  const invGateList = await fetchInvGateMesas();
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

  await db.transaction(async (tx) => {
    for (const a of diff.added) {
      await tx.insert(mesas).values({
        invgateId: a.invgateId,
        name: a.name,
        displayName: a.displayName,
        active: true,
        lastSyncedAt: now,
      });
    }
    for (const u of diff.updated) {
      await tx
        .update(mesas)
        .set({ name: u.name, displayName: u.displayName, active: true, lastSyncedAt: now })
        .where(inArray(mesas.invgateId, [u.invgateId]));
    }
    if (diff.deactivated.length > 0) {
      await tx
        .update(mesas)
        .set({ active: false, lastSyncedAt: now })
        .where(inArray(mesas.invgateId, diff.deactivated));
    }
  });

  await invalidatePermissionsCache();
  return {
    added: diff.added.length,
    updated: diff.updated.length,
    deactivated: diff.deactivated.length,
    total: invGateList.length,
  };
}
