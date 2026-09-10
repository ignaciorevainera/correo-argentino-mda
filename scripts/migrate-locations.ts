// scripts/migrate-locations.ts
import "dotenv/config";
import { invgateGet } from "../src/lib/invgateClient";
import { invgateQaGet, invgateQaPost } from "../src/lib/invgate-qa-client";
import type { InvgateLocation } from "../src/types/invgate";

interface LocationNode {
  prodId: number;
  name: string;
  prodParentId: number | null;
  children: LocationNode[];
}

interface MigrationResult {
  created: number;
  reused: number;
  skipped: number;
  errors: { name: string; reason: string }[];
  idMap: Map<number, number>;
  wouldCreate: number;
  total: number;
}

const CREATE_DELAY_MS = 200; // rate-limit between QA POSTs to avoid throttling

function buildTree(flatList: InvgateLocation[]): LocationNode[] {
  const nodeMap = new Map<number, LocationNode>();

  for (const loc of flatList) {
    nodeMap.set(loc.id, {
      prodId: loc.id,
      name: loc.name,
      prodParentId: loc.parent_id,
      children: [],
    });
  }

  const roots: LocationNode[] = [];

  for (const loc of flatList) {
    const node = nodeMap.get(loc.id)!;
    if (loc.parent_id === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(loc.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

function flattenTopological(roots: LocationNode[]): LocationNode[] {
  const result: LocationNode[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    queue.push(...node.children);
  }
  return result;
}

async function migrateLocations(dryRun: boolean): Promise<MigrationResult> {
  const idMap = new Map<number, number>();
  const result: MigrationResult = {
    created: 0,
    reused: 0,
    skipped: 0,
    errors: [],
    idMap,
    wouldCreate: 0,
    total: 0,
  };

  console.log("[MigrateLocations] Fetching locations from PROD...");
  const prodResponse = await invgateGet<InvgateLocation[]>("locations");

  if (!prodResponse.ok) {
    throw new Error(`Failed to fetch prod locations: ${prodResponse.message}`);
  }

  const flatList = Array.isArray(prodResponse.data) ? prodResponse.data : [];
  if (flatList.length === 0) {
    console.log(
      "[MigrateLocations] No locations found in PROD. Nothing to migrate.",
    );
    return result;
  }

  console.log(
    `[MigrateLocations] Fetched ${flatList.length} locations from PROD.`,
  );

  const prodIdSet = new Set(flatList.map((l) => l.id));

  console.log(
    "[MigrateLocations] Fetching existing locations from QA for resume matching...",
  );
  const qaResponse = await invgateQaGet<InvgateLocation[]>("locations");

  if (!qaResponse.ok) {
    throw new Error(`Failed to fetch QA locations: ${qaResponse.message}`);
  }

  const qaList = Array.isArray(qaResponse.data) ? qaResponse.data : [];
  const qaByNameParent = new Map<string, number>();
  for (const loc of qaList) {
    const key = `${loc.name}|${loc.parent_id ?? "null"}`;
    if (!qaByNameParent.has(key)) {
      qaByNameParent.set(key, loc.id);
    }
  }

  const qaIdSet = new Set(qaList.map((l) => l.id));
  const qaTopByName = new Map<string, number>();
  for (const loc of qaList) {
    const isTopLevel = loc.parent_id === null || !qaIdSet.has(loc.parent_id);
    if (isTopLevel && !qaTopByName.has(loc.name)) {
      qaTopByName.set(loc.name, loc.id);
    }
  }
  console.log(
    `[MigrateLocations] Found ${qaList.length} existing locations in QA (${qaByNameParent.size} unique name+parent keys, ${qaTopByName.size} top-level).`,
  );

  const roots = buildTree(flatList);
  const ordered = flattenTopological(roots);

  console.log(
    `[MigrateLocations] ${ordered.length} locations to migrate (${roots.length} roots).`,
  );

  if (dryRun) {
    console.log("[MigrateLocations] DRY RUN — no locations will be created.");
    const simulatedIds = new Set<number>();
    const simulatedQaIds = new Map<number, number>();
    let wouldCreate = 0;
    let wouldReuse = 0;
    for (const node of ordered) {
      const indent = getDepth(node, flatList);
      const prefix = "  ".repeat(indent);
      const parentIsReal =
        node.prodParentId !== null && prodIdSet.has(node.prodParentId);
      const willSkip =
        parentIsReal &&
        node.prodParentId !== null &&
        !simulatedIds.has(node.prodParentId);
      if (willSkip) {
        console.log(`${prefix}[SKIP] ${node.name} (parent missing)`);
        continue;
      }

      let existingQaId: number | undefined;
      if (parentIsReal && node.prodParentId !== null) {
        const parentQaId = simulatedQaIds.get(node.prodParentId);
        if (parentQaId !== undefined) {
          existingQaId = qaByNameParent.get(`${node.name}|${parentQaId}`);
        }
      } else {
        existingQaId =
          qaByNameParent.get(`${node.name}|null`) ?? qaTopByName.get(node.name);
      }

      if (existingQaId !== undefined) {
        simulatedQaIds.set(node.prodId, existingQaId);
        simulatedIds.add(node.prodId);
        wouldReuse++;
        console.log(
          `${prefix}[REUSE] ${node.name} (exists as QA#${existingQaId})`,
        );
        continue;
      }

      simulatedIds.add(node.prodId);
      wouldCreate++;
      const parentInfo =
        node.prodParentId !== null
          ? ` (parent: prod#${node.prodParentId})`
          : "";
      console.log(`${prefix}- ${node.name}${parentInfo}`);
    }
    result.wouldCreate = wouldCreate;
    result.reused = wouldReuse;
    result.total = ordered.length;
    console.log(
      `[MigrateLocations] DRY RUN would create: ${wouldCreate} of ${ordered.length}`,
    );
    console.log(`[MigrateLocations] DRY RUN would reuse: ${wouldReuse}`);
    return result;
  }

  for (const node of ordered) {
    const body: { name: string; parent_id?: number } = { name: node.name };
    let parentQaId: number | null = null;

    const parentIsReal =
      node.prodParentId !== null && prodIdSet.has(node.prodParentId);
    if (parentIsReal && node.prodParentId !== null) {
      const qaParentId = idMap.get(node.prodParentId);
      if (qaParentId === undefined) {
        result.errors.push({
          name: node.name,
          reason: `Parent prod#${node.prodParentId} failed or not created yet. Skipping.`,
        });
        result.skipped++;
        continue;
      }
      body.parent_id = qaParentId;
      parentQaId = qaParentId;
    }

    let existingQaId: number | undefined;
    if (parentIsReal) {
      existingQaId = qaByNameParent.get(`${node.name}|${parentQaId}`);
    } else {
      existingQaId =
        qaByNameParent.get(`${node.name}|null`) ?? qaTopByName.get(node.name);
    }

    if (existingQaId !== undefined) {
      idMap.set(node.prodId, existingQaId);
      result.reused++;
      console.log(
        `[MigrateLocations] Reused ${node.name} as QA#${existingQaId}`,
      );
      continue;
    }

    console.log(
      `[MigrateLocations] Creating: ${node.name}${body.parent_id ? ` (parent: QA#${body.parent_id})` : ""}`,
    );

    const postResponse = await invgateQaPost<{ id: number }>("locations", body);

    if (!postResponse.ok) {
      result.errors.push({
        name: node.name,
        reason: `POST failed: ${postResponse.message}`,
      });
      result.skipped++;
      continue;
    }

    const newId = postResponse.data.id;
    idMap.set(node.prodId, newId);
    result.created++;
    console.log(`[MigrateLocations] Created ${node.name} as QA#${newId}`);

    await sleep(CREATE_DELAY_MS);
  }

  return result;
}

function getDepth(node: LocationNode, flatList: InvgateLocation[]): number {
  let depth = 0;
  let current: LocationNode | undefined = node;
  while (current && current.prodParentId !== null) {
    const parent = flatList.find((l) => l.id === current!.prodParentId);
    if (!parent) break;
    depth++;
    current = {
      prodId: parent.id,
      name: parent.name,
      prodParentId: parent.parent_id,
      children: [],
    };
  }
  return depth;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp(): void {
  console.log(`
Usage: npx tsx scripts/migrate-locations.ts [--dry-run] [--help]

Flags:
  --dry-run   Fetch locations from PROD and print the tree without creating anything in QA.
  --help      Show this help message.

Resume/idempotency:
  Before migrating, the script fetches existing QA locations and matches them by the
  (name, parent) pair. Locations already present in QA are reused (their QA id is mapped)
  instead of being POSTed again, so an interrupted migration can be resumed safely.

Environment:
  INVGATE_API_KEY          API key for PROD InvGate
  INVGATE_BASE_URL         Base URL for PROD InvGate (must end with /api/v1/)
  INVGATE_API_USERNAME     Username for PROD InvGate (default: portalmda)
  INVGATE_QA_API_KEY       API key for QA InvGate
  INVGATE_QA_BASE_URL      Base URL for QA InvGate (must end with /api/v1/)
  INVGATE_QA_API_USERNAME  Username for QA InvGate (default: portalmda)
`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  const dryRun = process.argv.includes("--dry-run");

  console.log("[MigrateLocations] Starting migration...");
  console.log(`[MigrateLocations] Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  const startTime = Date.now();

  try {
    const result = await migrateLocations(dryRun);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[MigrateLocations] Done in ${elapsed}s.`);
    if (dryRun) {
      console.log(`  Would create: ${result.wouldCreate} of ${result.total}`);
      console.log(`  Would reuse: ${result.reused}`);
    } else {
      console.log(`  Created: ${result.created}`);
      console.log(`  Reused: ${result.reused}`);
      console.log(`  Skipped: ${result.skipped}`);
    }
    console.log(`  Errors:  ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\n[MigrateLocations] Errors:");
      for (const err of result.errors) {
        console.log(`  - ${err.name}: ${err.reason}`);
      }
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[MigrateLocations] Fatal error: ${message}`);
    process.exit(1);
  }
}

main();
