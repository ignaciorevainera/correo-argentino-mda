import { db } from "@db/index";
import { offices, terminals } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import {
  buildTerminalSnapshot,
  createSnapshotCache,
  type TerminalMinimalRow,
  type TerminalSnapshot,
} from "@lib/terminalSnapshot";

async function loadAllMinimalRows(): Promise<TerminalMinimalRow[]> {
  return db
    .select({
      id: terminals.id,
      hostname: terminals.hostname,
      ipAddress: terminals.ipAddress,
      macAddress: terminals.macAddress,
      operatingSystem: terminals.operatingSystem,
      manufacturer: terminals.manufacturer,
      model: terminals.model,
      nis: terminals.nis,
      lastContact: terminals.lastContact,
    })
    .from(terminals)
    .leftJoin(offices, eq(terminals.nis, offices.code))
    .all();
}

async function loadTerminalSignature(): Promise<string> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      maxSyncedAt: sql<string | null>`MAX(${terminals.syncedAt})`,
    })
    .from(terminals);
  return `${row.count}:${row.maxSyncedAt ?? ""}`;
}

const snapshotCache = createSnapshotCache<TerminalSnapshot>({
  loadSignature: loadTerminalSignature,
  loadSnapshot: async (signature) =>
    buildTerminalSnapshot(signature, await loadAllMinimalRows()),
});

export function getTerminalSnapshot(): Promise<TerminalSnapshot> {
  return snapshotCache.get();
}
