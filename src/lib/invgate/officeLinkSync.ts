import { db } from "../../db/index";
import { offices, officeInvgateLinks } from "../../db/schema";
import { invgateGet } from "../invgateClient";
import { matchLocations, parseInvgateLocationName, findDuplicateNis } from "./locationMatcher";
import type { InvgateLocation } from "../../types/invgate";
import { eq } from "drizzle-orm";

export interface SyncOfficeLinksResult {
  ok: boolean;
  totalInvgateLocations: number;
  totalMdaOffices: number;
  matched: number;
  unmatchedInvgate: number;
  duplicatesFound: number;
  error?: string;
}

async function resolveParentName(
  locations: InvgateLocation[],
  parentId: number | null,
): Promise<string | null> {
  if (parentId === null) return null;
  const parent = locations.find((l) => l.id === parentId);
  return parent ? parseInvgateLocationName(parent.name).displayName : null;
}

export async function syncOfficeInvgateLinks(): Promise<SyncOfficeLinksResult> {
  console.log("[SyncOfficeLinks] Iniciando sincronización de vínculos oficinas ↔ InvGate...");

  // 1. Fetch all InvGate locations
  const locationsResult = await invgateGet<any[]>("locations");
  if (!locationsResult.ok || !("data" in locationsResult)) {
    const errorMsg = "message" in locationsResult ? (locationsResult as any).message : "Sin datos";
    return {
      ok: false,
      totalInvgateLocations: 0,
      totalMdaOffices: 0,
      matched: 0,
      unmatchedInvgate: 0,
      duplicatesFound: 0,
      error: errorMsg,
    };
  }

  const locations: InvgateLocation[] = Array.isArray(locationsResult.data)
    ? locationsResult.data
    : (locationsResult.data as any).data;

  if (!Array.isArray(locations)) {
    return {
      ok: false,
      totalInvgateLocations: 0,
      totalMdaOffices: 0,
      matched: 0,
      unmatchedInvgate: 0,
      duplicatesFound: 0,
      error: "Formato inesperado de locations",
    };
  }

  console.log(`[SyncOfficeLinks] ${locations.length} ubicaciones obtenidas de InvGate.`);

  // 2. Detect duplicate NIS
  const duplicateNis = findDuplicateNis(locations);
  const nisSeen = new Set<string>();

  // 3. Filter out duplicate locations (keep only first per NIS)
  const dedupedLocations = locations.filter((loc) => {
    const parsed = parseInvgateLocationName(loc.name);
    if (!parsed.nis) return true;
    if (nisSeen.has(parsed.nis)) return false;
    nisSeen.add(parsed.nis);
    return true;
  });

  // 4. Load all office codes into a Map
  const allOfficesRows = await db
    .select({ id: offices.id, code: offices.code, name: offices.name, address: offices.address })
    .from(offices);
  const officeCodeMap = new Map<string, { name: string; address: string }>();
  const officeToId = new Map<string, number>();
  for (const o of allOfficesRows) {
    if (o.code) {
      officeCodeMap.set(o.code, { name: o.name, address: o.address ?? "" });
      officeToId.set(o.code, o.id);
    }
  }

  // 5. Run existing matcher
  const { results, stats } = matchLocations(dedupedLocations, officeCodeMap);

  // 6. Upsert into office_invgate_links
  const syncedAt = new Date().toISOString();
  let upsertedCount = 0;
  let duplicatesWritten = 0;

  const rawLocById = new Map(dedupedLocations.map((l) => [l.id, l]));

  for (const match of results) {
    if (!match.matched) continue;

    const officeDbId = officeToId.get(match.officeCode!);
    if (!officeDbId) continue;

    const invgateLoc = match.invgateLocation;
    const rawLoc = rawLocById.get(invgateLoc.id);
    const parentId = rawLoc?.parent_id ?? null;
    const dupCount = invgateLoc.nis ? (duplicateNis.get(invgateLoc.nis) || 0) : 0;
    if (dupCount > 0) duplicatesWritten++;

    const parentName = await resolveParentName(dedupedLocations, parentId);

    const existing = await db
      .select({ id: officeInvgateLinks.id })
      .from(officeInvgateLinks)
      .where(eq(officeInvgateLinks.officeId, officeDbId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(officeInvgateLinks)
        .set({
          invgateLocationId: invgateLoc.id,
          invgateParentId: parentId,
          invgateParentName: parentName,
          invgateDisplayName: invgateLoc.displayName,
          invgateCp: invgateLoc.cp,
          invgateCc: invgateLoc.cc,
          invgateAddress: invgateLoc.address,
          invgateDuplicateCount: dupCount,
          lastSyncedAt: syncedAt,
        })
        .where(eq(officeInvgateLinks.id, existing[0].id));
    } else {
      await db.insert(officeInvgateLinks).values({
        officeId: officeDbId,
        invgateLocationId: invgateLoc.id,
        invgateParentId: parentId,
        invgateParentName: parentName,
        invgateDisplayName: invgateLoc.displayName,
        invgateCp: invgateLoc.cp,
        invgateCc: invgateLoc.cc,
        invgateAddress: invgateLoc.address,
        invgateDuplicateCount: dupCount,
        lastSyncedAt: syncedAt,
      });
    }
    upsertedCount++;
  }

  console.log(
    `[SyncOfficeLinks] Sincronización finalizada. Matched: ${stats.matched}, ` +
    `Upserted: ${upsertedCount}, Duplicados: ${duplicatesWritten}`
  );

  return {
    ok: true,
    totalInvgateLocations: stats.totalInvgate,
    totalMdaOffices: stats.totalMda,
    matched: stats.matched,
    unmatchedInvgate: stats.unmatchedInvgate,
    duplicatesFound: duplicatesWritten,
  };
}
