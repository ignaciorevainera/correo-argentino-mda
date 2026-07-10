import type { LocationComparisonResult } from "./locationMatcher";
import type { InvgateLocation } from "../../types/invgate";
import { invgateGet } from "@lib/invgateClient";
import { db } from "@db/index";
import { offices } from "@db/schema";
import { matchLocations } from "./locationMatcher";

let cachedComparison: LocationComparisonResult | null = null;
let lastFetchAttempt: number = 0;

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getOrRefreshComparison(): Promise<{
  data: LocationComparisonResult | null;
  error?: string;
  status?: number;
}> {
  const now = Date.now();
  if (cachedComparison && now - lastFetchAttempt < CACHE_TTL_MS) {
    return { data: cachedComparison };
  }

  const response = await invgateGet<InvgateLocation[]>("locations");
  if (!response.ok) {
    return { data: null, error: response.message, status: response.status || 500 };
  }

  const dbOffices = await db
    .select({
      code: offices.code,
      name: offices.name,
      address: offices.address,
    })
    .from(offices);

  const officeMap = new Map<string, { name: string; address: string }>();
  for (const off of dbOffices) {
    officeMap.set(off.code, { name: off.name, address: off.address ?? "" });
  }

  cachedComparison = matchLocations(response.data, officeMap);
  lastFetchAttempt = now;
  return { data: cachedComparison };
}

export function clearCache(): void {
  cachedComparison = null;
  lastFetchAttempt = 0;
}
