import type { InvgateLocation } from "@/types/invgate";
import { invgateGet } from "@lib/invgateClient";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { parseInvgateLocationName } from "@lib/invgate/locationMatcher";
import { USE_QA_INVGATE, getInvgateLocationId } from "@lib/telegrafiaTicket";

export async function resolveInvgateLocationId(
  officeCode: string,
): Promise<number | null> {
  if (!USE_QA_INVGATE) {
    return getInvgateLocationId(officeCode);
  }

  const getFn = USE_QA_INVGATE ? invgateQaGet : invgateGet;

  const res = await getFn<InvgateLocation[]>("locations?limit=5000");
  if (!res.ok || !Array.isArray(res.data)) return null;

  const nis = officeCode.trim();
  const match = res.data.find((loc) => {
    const parsed = parseInvgateLocationName(loc.name);
    return parsed.nis === nis;
  });

  return match?.id ?? null;
}
