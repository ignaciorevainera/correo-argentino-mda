import type { APIRoute } from "astro";
import { requestRelease } from "@lib/disponibilidad";
import { jsonResponse } from "@lib/apiResponse";

export const POST: APIRoute = async () => {
  try {
    await requestRelease();
    return jsonResponse({ success: true });
  } catch (error: any) { return jsonResponse({ error: error.message }, 500); }
};
