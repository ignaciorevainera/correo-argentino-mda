import type { APIRoute } from "astro";
import { getDisponibilidadHoy } from "@lib/disponibilidad";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const GET: APIRoute = async () => {
  try {
    const list = await getDisponibilidadHoy();
    return jsonResponse(list, 200, "no-store, no-cache, must-revalidate");
  } catch (error: any) {
    console.error("GET /api/disponibilidad Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
