import {
  buildDuplicateClusters,
  type DuplicateCluster,
} from "./duplicateGroups";

export interface TerminalMinimalRow {
  id: number;
  hostname: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  operatingSystem: string | null;
  manufacturer: string | null;
  model: string | null;
  nis: string | null;
  lastContact: string | null;
}

export interface TerminalSnapshot {
  signature: string;
  rows: TerminalMinimalRow[];
  rowsById: Map<number, TerminalMinimalRow>;
  allRowIds: Set<number>;
  clusters: DuplicateCluster[];
  clusterByRowId: Map<number, DuplicateCluster>;
  clusterMemberIds: Set<number>;
}

export interface SnapshotCache<T> {
  get(): Promise<T>;
  clear(): void;
}

export function createSnapshotCache<T>(options: {
  loadSignature: () => Promise<string>;
  loadSnapshot: (signature: string) => Promise<T>;
}): SnapshotCache<T> {
  let cached: { signature: string; value: T } | null = null;
  let inFlight: { signature: string; promise: Promise<T> } | null = null;
  let epoch = 0;

  return {
    async get(): Promise<T> {
      const signature = await options.loadSignature();
      if (cached && cached.signature === signature) return cached.value;
      if (inFlight && inFlight.signature === signature) return inFlight.promise;

      const startEpoch = epoch;
      const promise = (async () => {
        try {
          const value = await options.loadSnapshot(signature);
          if (startEpoch === epoch && (!inFlight || inFlight.promise === promise)) {
            cached = { signature, value };
          }
          return value;
        } finally {
          if (inFlight && inFlight.promise === promise) inFlight = null;
        }
      })();
      inFlight = { signature, promise };
      return promise;
    },
    clear(): void {
      epoch++;
      cached = null;
      inFlight = null;
    },
  };
}

export function buildTerminalSnapshot(
  signature: string,
  rows: TerminalMinimalRow[],
): TerminalSnapshot {
  const rowsById = new Map<number, TerminalMinimalRow>();
  const allRowIds = new Set<number>();
  for (const row of rows) {
    rowsById.set(row.id, row);
    allRowIds.add(row.id);
  }

  const clusters = buildDuplicateClusters(
    rows.map((row) => ({
      id: row.id,
      ip: row.ipAddress,
      mac: row.macAddress,
      hostname: row.hostname,
    })),
  );

  const clusterByRowId = new Map<number, DuplicateCluster>();
  const clusterMemberIds = new Set<number>();
  for (const cluster of clusters) {
    for (const id of cluster.ids) {
      clusterByRowId.set(id, cluster);
      clusterMemberIds.add(id);
    }
  }

  return {
    signature,
    rows,
    rowsById,
    allRowIds,
    clusters,
    clusterByRowId,
    clusterMemberIds,
  };
}
