import type { APIRoute } from "astro";
import { getLockStatus, heartbeatLock } from "@lib/disponibilidad";
import { jsonResponse } from "@lib/apiResponse";

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);
  try {
    const status = await getLockStatus();
    if (status.status === "occupied" && status.user.userId === user.id) {
      if (status.user.releaseRequested) {
        return jsonResponse({ success: false, releaseRequested: true });
      }
      await heartbeatLock(user.id);
    }
    return jsonResponse({ success: true });
  } catch (error: any) { return jsonResponse({ error: error.message }, 500); }
};
