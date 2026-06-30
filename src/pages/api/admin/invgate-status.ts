import type { APIRoute } from "astro";
import { invgateGet } from "@/lib/invgateClient";
import { jsonResponse } from "@/lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const result = await invgateGet<unknown>("incidents?page=1&page_size=1");

  return jsonResponse({
    ok: result.ok,
    status: result.status,
    message: result.ok
      ? "Conexión exitosa"
      : ("message" in result ? result.message : "Fallo de conexión"),
  });
};
