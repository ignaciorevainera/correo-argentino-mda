import type { APIRoute } from "astro";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

export const GET: APIRoute = async () => {
  try {
    // 1. Read baseline JSON data
    const jsonPath = path.resolve("./public/data/cronograma.json");
    const jsonRaw = await fs.readFile(jsonPath, "utf-8");
    const baseline = JSON.parse(jsonRaw);

    // 2. Fetch all persistent schedule overrides from DB
    const dbSchedules = await db.select().from(schedules);

    // 3. Merge database overrides into baseline JSON structure
    const merged = baseline.map((operator: any) => {
      const name = operator.nombre;
      const opOverrides = dbSchedules.filter((s) => s.agentName === name);

      const newAsistencia = { ...operator.asistencia };
      const newComentarios: Record<string, string> = {};

      opOverrides.forEach((s) => {
        if (s.status === "Franco" || s.status === "") {
          newAsistencia[s.date] = "Franco";
        } else {
          newAsistencia[s.date] = s.status;
        }
        if (s.comment) {
          newComentarios[s.date] = s.comment;
        }
      });

      return {
        ...operator,
        asistencia: newAsistencia,
        comentarios: newComentarios,
      };
    });

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { edits } = body; // Array of { agentName, date, status, comment }

    if (!Array.isArray(edits)) {
      return new Response(JSON.stringify({ error: "Edits must be an array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process each edit
    for (const edit of edits) {
      const { agentName, date, status, comment } = edit;
      if (!agentName || !date) continue;

      const existing = await db
        .select()
        .from(schedules)
        .where(
          and(
            eq(schedules.agentName, agentName),
            eq(schedules.date, date)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const updateData: any = {};
        if (status !== undefined) updateData.status = status;
        if (comment !== undefined) updateData.comment = comment;

        await db
          .update(schedules)
          .set(updateData)
          .where(eq(schedules.id, existing[0].id));
      } else {
        await db.insert(schedules).values({
          agentName,
          date,
          status: status !== undefined ? status : "Franco",
          comment: comment || "",
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
