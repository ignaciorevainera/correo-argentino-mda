export interface DuplicateRow {
  id: number;
  ip: string | null;
  mac: string | null;
  hostname: string | null;
}

export interface DuplicateCluster {
  ids: number[];
  sharedIps: string[];
  sharedMacs: string[];
  sharedHostnames: string[];
}

export interface DuplicateActiveRow {
  id: number;
  lastContactRaw: string;
}

export function normalizeDuplicateKey(
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase();
}

function sharedValues(
  rows: DuplicateRow[],
  pick: (row: DuplicateRow) => string | null,
): string[] {
  const countByNorm = new Map<string, number>();
  const firstRaw = new Map<string, string>();
  for (const row of rows) {
    const raw = pick(row);
    const norm = normalizeDuplicateKey(raw);
    if (!norm) continue;
    countByNorm.set(norm, (countByNorm.get(norm) ?? 0) + 1);
    if (!firstRaw.has(norm)) firstRaw.set(norm, (raw ?? "").trim());
  }
  const result: string[] = [];
  for (const [norm, count] of countByNorm) {
    if (count > 1) result.push(firstRaw.get(norm) ?? norm);
  }
  return result;
}

export function buildDuplicateClusters(
  rows: DuplicateRow[],
): DuplicateCluster[] {
  const parent = new Map<number, number>();
  for (const row of rows) parent.set(row.id, row.id);

  const find = (start: number): number => {
    let root = start;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let node = start;
    while (parent.get(node) !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  const buckets = new Map<string, number[]>();
  const addBucket = (
    field: string,
    raw: string | null,
    id: number,
  ): void => {
    const norm = normalizeDuplicateKey(raw);
    if (!norm) return;
    const key = `${field}:${norm}`;
    const list = buckets.get(key);
    if (list) list.push(id);
    else buckets.set(key, [id]);
  };

  for (const row of rows) {
    addBucket("ip", row.ip, row.id);
    addBucket("mac", row.mac, row.id);
    addBucket("host", row.hostname, row.id);
  }

  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  const groups = new Map<number, DuplicateRow[]>();
  for (const row of rows) {
    const root = find(row.id);
    const list = groups.get(root);
    if (list) list.push(row);
    else groups.set(root, [row]);
  }

  const clusters: DuplicateCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    clusters.push({
      ids: members.map((member) => member.id),
      sharedIps: sharedValues(members, (member) => member.ip),
      sharedMacs: sharedValues(members, (member) => member.mac),
      sharedHostnames: sharedValues(members, (member) => member.hostname),
    });
  }
  return clusters;
}

export function selectActiveMember(
  rows: DuplicateActiveRow[],
  nowMs: number = Date.now(),
): { activeId: number | null; isActiveWithinLast24h: boolean } {
  if (rows.length === 0) {
    return { activeId: null, isActiveWithinLast24h: false };
  }

  const parseMs = (raw: string): number => {
    if (!raw) return -Infinity;
    const ms = new Date(raw.replace(" ", "T")).getTime();
    return Number.isNaN(ms) ? -Infinity : ms;
  };

  let bestId = rows[0].id;
  let bestTs = parseMs(rows[0].lastContactRaw);
  for (const row of rows) {
    const ts = parseMs(row.lastContactRaw);
    if (ts > bestTs) {
      bestTs = ts;
      bestId = row.id;
    }
  }

  const isActiveWithinLast24h =
    bestTs !== -Infinity && nowMs - bestTs < 24 * 60 * 60 * 1000;
  return { activeId: bestId, isActiveWithinLast24h };
}
