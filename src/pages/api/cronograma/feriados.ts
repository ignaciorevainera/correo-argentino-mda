import type { APIRoute } from "astro";
import { db } from "@db/index";
import { holidays } from "@db/schema";
import { jsonResponse } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";

export const GET: APIRoute = async () => {
  try {
    const dbHolidays = await db.select().from(holidays);
    const feriados: Record<string, string> = {};
    for (const h of dbHolidays) {
      feriados[h.date] = h.name;
    }
    return jsonResponse(feriados, 200, "public, max-age=3600, stale-while-revalidate");
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { feriados } = body;
    if (!feriados || typeof feriados !== "object") {
      return jsonResponse({ error: "Invalid payload: 'feriados' must be an object" }, 400);
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

    return jsonResponse({ success: true });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
};
