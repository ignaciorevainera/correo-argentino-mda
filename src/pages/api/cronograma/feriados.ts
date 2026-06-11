import type { APIRoute } from "astro";
import fs from "node:fs/promises";
import path from "node:path";

const getFilePath = () => path.resolve("src/components/cronograma/lib/feriados.json");

export const GET: APIRoute = async () => {
  try {
    const data = await fs.readFile(getFilePath(), "utf-8");
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { feriados } = body;
    if (!feriados || typeof feriados !== "object") {
      return new Response(JSON.stringify({ error: "Invalid payload: 'feriados' must be an object" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await fs.writeFile(getFilePath(), JSON.stringify(feriados, null, 2), "utf-8");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
