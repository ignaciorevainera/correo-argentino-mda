import type { APIRoute } from "astro";
import { getLockStatus, acquireLock, releaseLock } from "@lib/disponibilidad";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async () => {
  try { return jsonResponse(await getLockStatus()); }
  catch (error: any) { return jsonResponse({ error: error.message }, 500); }
};

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);
  try {
    const result = await acquireLock(user.id, user.username || "Usuario");
    if (!result.success) {
      if (result.reason === "occupied") {
        return jsonResponse({ error: "Lock en manos de " + result.holder, holder: result.holder }, 409);
      }
      return jsonResponse({ error: "Error al adquirir el lock" }, 409);
    }
    return jsonResponse({ success: true });
  } catch (error: any) { return jsonResponse({ error: error.message }, 500); }
};

export const DELETE: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);
  try {
    const ok = await releaseLock(user.id, user.role === "admin");
    if (!ok) return jsonResponse({ error: "No podés liberar un lock que no te pertenece" }, 403);
    return jsonResponse({ success: true });
  } catch (error: any) { return jsonResponse({ error: error.message }, 500); }
};
