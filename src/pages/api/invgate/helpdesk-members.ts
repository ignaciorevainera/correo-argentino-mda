import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import type { InvgateHelpdeskAndLevel, InvgateUser } from "@/types/invgate";

export const GET: APIRoute = async ({ url }) => {
  const invgateIdRaw = url.searchParams.get("invgate_id");
  const invgateId = invgateIdRaw ? Number(invgateIdRaw) : NaN;

  if (!invgateIdRaw || isNaN(invgateId)) {
    return jsonResponse({ error: "invgate_id es requerido y debe ser un numero" }, 400);
  }

  try {
    const result = await invgateGet<InvgateHelpdeskAndLevel[]>("helpdesksandlevels");

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const all = Array.isArray(result.data) ? result.data : [];

    const helpdesk = all.find((h) => h.id === invgateId && !h.level_order);

    const subLevels = all.filter((h) => h.parent_id === invgateId && h.level_order !== undefined);

    const memberIdSet = new Set<number>();
    if (helpdesk && helpdesk.members_ids) {
      helpdesk.members_ids.forEach((id) => memberIdSet.add(id));
    }
    subLevels.forEach((level) => {
      if (level.members_ids) {
        level.members_ids.forEach((id) => memberIdSet.add(id));
      }
    });

    const memberNames: string[] = [];
    for (const memberId of memberIdSet) {
      try {
        const userResult = await invgateGet<InvgateUser>(`user?id=${memberId}`);
        if (userResult.ok && userResult.data) {
          const u = userResult.data;
          memberNames.push(`${u.name} ${u.lastname}`.trim());
        }
      } catch {}
    }

    const levelsInfo = subLevels.map((level) => ({
      name: level.name || `Nivel ${level.level_order}`,
      memberCount: level.total_members,
    }));

    return jsonResponse(
      {
        members: memberNames.sort(),
        levels: levelsInfo,
      },
      200,
      "private, max-age=300",
    );
  } catch (error: any) {
    console.error("[InvGate Helpdesk Members] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
