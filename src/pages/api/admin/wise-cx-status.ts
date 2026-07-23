import type { APIRoute } from "astro";
import { wiseCxGet } from "@/lib/wise-cx-client";
import { jsonResponse } from "@/lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const result = await wiseCxGet<unknown>("/core/v1/channels?limit=1");

  return jsonResponse({
    ok: result.ok,
    status: result.status,
    message: result.ok
      ? "Conexión exitosa (Wise CX)"
      : ("message" in result ? result.message : "Fallo de conexión (Wise CX)"),
  });
};
