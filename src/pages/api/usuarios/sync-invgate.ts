import type { APIRoute } from "astro";
import { can } from "@lib/roleConfig";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";
import { fullInvgateSync } from "@lib/invgate/userSync";

export const POST: APIRoute = async ({ locals }) => {
  // Auth: solo admin
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "admin")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  try {
    const result = await fullInvgateSync();

    if (!result.ok) {
      return jsonResponse(
        { error: result.error || "Error al sincronizar con InvGate" },
        500
      );
    }

    return jsonResponse({
      ok: true,
      totalSynced: result.totalSynced,
    });
  } catch (error: any) {
    console.error("[SyncInvGate] Error:", error);
    return jsonError(sanitizeError(error) || "Error al sincronizar con InvGate", 500);
  }
};
