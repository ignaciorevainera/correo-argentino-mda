import type { APIRoute } from "astro";
import { getDisponibilidadHoy } from "@/lib/disponibilidad";

export const GET: APIRoute = async () => {
  try {
    const list = await getDisponibilidadHoy();
    
    return new Response(JSON.stringify(list), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("GET /api/disponibilidad Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};
