// src/pages/api/admin/invgate-qa-status.ts
import type { APIRoute } from "astro";
import { invgateQaGet } from "@/lib/invgate-qa-client";
import { jsonResponse } from "@/lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const result = await invgateQaGet<{ version: string }>("sd.version");

  return jsonResponse({
    ok: result.ok,
    status: result.status,
    message: result.ok
      ? "Conexión exitosa (QA)"
      : ("message" in result ? result.message : "Fallo de conexión (QA)"),
  });
};
