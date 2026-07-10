import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const start = Date.now();
    const result = await invgateGet<{ version: string }>("sd.version");
    const elapsed = Date.now() - start;

    if (!result.ok) {
      return jsonResponse({
        ok: false,
        message: result.message,
        elapsed,
      }, result.status);
    }

    return jsonResponse({
      ok: true,
      elapsed,
      version: result.data.version,
    });
  } catch (error: any) {
    console.error("[InvGate Ping] Error:", error);
    return jsonResponse({ ok: false, error: sanitizeError(error) }, 500);
  }
};
