import type { APIRoute } from "astro";
import { asignarSiguienteAutogestion } from "@/lib/disponibilidad";

export const POST: APIRoute = async () => {
  try {
    const result = await asignarSiguienteAutogestion();
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("POST /api/disponibilidad/asignar Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};
