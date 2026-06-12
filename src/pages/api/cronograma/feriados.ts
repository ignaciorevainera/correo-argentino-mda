import type { APIRoute } from "astro";
import { db } from "@/db";
import { holidays } from "@/db/schema";

export const GET: APIRoute = async () => {
  try {
    const dbHolidays = await db.select().from(holidays);
    const feriados: Record<string, string> = {};
    for (const h of dbHolidays) {
      feriados[h.date] = h.name;
    }
    return new Response(JSON.stringify(feriados), {
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

    db.transaction((tx) => {
      tx.delete(holidays).run();
      
      const insertData = Object.entries(feriados).map(([date, name]) => ({
        date,
        name: String(name),
      }));

      if (insertData.length > 0) {
        tx.insert(holidays).values(insertData).run();
      }
    });

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
