import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import type { InvgateHelpdeskAndLevel, InvgateUser } from "@/types/invgate";
import { TELEGRAFIA_HELPDESK_ID } from "@lib/telegrafiaTicket";

export interface TelegrafiaAgent {
  id: number;
  name: string;
  username: string;
}

export const GET: APIRoute = async ({ locals }) => {
  const denied = requireWriteAccess(locals, "usuarios");
  if (denied) return denied;

  try {
    const helpdesksRes =
      await invgateGet<InvgateHelpdeskAndLevel[]>("helpdesksandlevels");

    if (!helpdesksRes.ok) {
      return jsonResponse({ error: helpdesksRes.message }, helpdesksRes.status);
    }

    const all = Array.isArray(helpdesksRes.data) ? helpdesksRes.data : [];

    const helpdesk = all.find(
      (h) => h.id === TELEGRAFIA_HELPDESK_ID && !h.level_order,
    );

    const subLevels = all.filter(
      (h) =>
        h.parent_id === TELEGRAFIA_HELPDESK_ID && h.level_order !== undefined,
    );

    const memberIdSet = new Set<number>();
    if (helpdesk?.members_ids) {
      helpdesk.members_ids.forEach((id) => memberIdSet.add(id));
    }
    subLevels.forEach((level) => {
      if (level.members_ids) {
        level.members_ids.forEach((id) => memberIdSet.add(id));
      }
    });

    const agents: TelegrafiaAgent[] = [];
    for (const memberId of memberIdSet) {
      try {
        const userResult = await invgateGet<InvgateUser>(`user?id=${memberId}`);
        if (userResult.ok && userResult.data) {
          const u = userResult.data;
          agents.push({
            id: u.id,
            name: `${u.name} ${u.lastname}`.trim(),
            username: u.username,
          });
        }
      } catch {}
    }

    agents.sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({ agents }, 200, "private, max-age=300");
  } catch (error: any) {
    console.error("[Telegrafia Agents] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
