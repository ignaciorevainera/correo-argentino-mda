import type { APIRoute } from "astro";
import { db } from "@/db";
import { saturdayRotationConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async () => {
  try {
    const configList = await db.select().from(saturdayRotationConfig).limit(1);
    let config = configList[0];

    if (!config) {
      await db.insert(saturdayRotationConfig).values({
        rotationOrder: "A,B,C,D",
        startDate: "2026-06-06",
        startGroup: "A",
      });
      const insertedList = await db.select().from(saturdayRotationConfig).limit(1);
      config = insertedList[0];
    }

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET rotation-config API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { rotationOrder, startDate, startGroup } = await request.json();

    const configList = await db.select().from(saturdayRotationConfig).limit(1);
    const existing = configList[0];

    if (existing) {
      await db
        .update(saturdayRotationConfig)
        .set({ rotationOrder, startDate, startGroup })
        .where(eq(saturdayRotationConfig.id, existing.id));
    } else {
      await db
        .insert(saturdayRotationConfig)
        .values({
          rotationOrder,
          startDate,
          startGroup,
        });
    }

    const updatedList = await db.select().from(saturdayRotationConfig).limit(1);
    const result = updatedList[0];

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST rotation-config API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
