import type { APIRoute } from "astro";
import { getDisponibilidadHoy } from "@/lib/disponibilidad";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async () => {
  try {
    const list = await getDisponibilidadHoy();
    return jsonResponse(list);
  } catch (error: any) {
    console.error("GET /api/disponibilidad Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
