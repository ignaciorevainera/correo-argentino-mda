import type { APIRoute } from "astro";
import { invgateGet } from "@/lib/invgateClient";
import { jsonResponse } from "@/lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-status] Starting InvGate check...");
  console.log("[invgate-status] env vars:", {
    keyDefined: !!import.meta.env.INVGATE_API_KEY,
    baseUrl: import.meta.env.INVGATE_BASE_URL,
    username: import.meta.env.INVGATE_API_USERNAME,
  });

  const result = await invgateGet<unknown>("sd.version");

  console.log("[invgate-status] Result:", JSON.stringify(result));

  return jsonResponse({
    ok: result.ok,
    status: result.status,
    message: result.ok
      ? "Conexión exitosa"
      : ("message" in result ? result.message : "Fallo de conexión"),
  });
};
