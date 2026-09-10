import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import type { InvgateHelpdeskAndLevel, InvgateUser } from "@/types/invgate";
import { TECLOCAL_REGIONS } from "@lib/techRegionsConfig";

export interface RegionTechMember {
  id: number;
  name: string;
  username: string;
}

export const GET: APIRoute = async () => {
  try {
    const helpdesksRes =
      await invgateGet<InvgateHelpdeskAndLevel[]>("helpdesksandlevels");

    if (!helpdesksRes.ok) {
      return jsonResponse({ error: helpdesksRes.message }, helpdesksRes.status);
    }

    const all = Array.isArray(helpdesksRes.data) ? helpdesksRes.data : [];
    const levelById = new Map<number, InvgateHelpdeskAndLevel>();
    all.forEach((h) => levelById.set(h.id, h));

    const memberIds: number[] = [];
    for (const cfg of Object.values(TECLOCAL_REGIONS)) {
      const level = levelById.get(cfg.helpdeskLevelId);
      if (level?.members_ids) memberIds.push(...level.members_ids);
    }

    const uniqueIds = [...new Set(memberIds)];
    const userById = new Map<number, InvgateUser>();
    for (const id of uniqueIds) {
      try {
        const userResult = await invgateGet<InvgateUser>(`user?id=${id}`);
        if (userResult.ok && userResult.data) {
          userById.set(id, userResult.data);
        }
      } catch {}
    }

    const regions = Object.entries(TECLOCAL_REGIONS).map(([regionId, cfg]) => {
      const level = levelById.get(cfg.helpdeskLevelId);
      const members = (level?.members_ids ?? [])
        .map((id) => userById.get(id))
        .filter((u): u is InvgateUser => Boolean(u))
        .map((u) => ({
          id: u.id,
          name: `${u.name} ${u.lastname}`.trim(),
          username: u.username,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        regionId,
        helpdeskId: cfg.helpdeskLevelId,
        helpdeskName: cfg.helpdeskName,
        members,
      };
    });

    return jsonResponse({ regions }, 200, "private, max-age=300");
  } catch (error: any) {
    console.error("[Region Tech Members] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
