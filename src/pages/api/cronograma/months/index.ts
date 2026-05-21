import type { APIRoute } from "astro";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { and, eq, like } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { year, month } = body; // month is 0-indexed (0 = Enero)

    if (year === undefined || month === undefined) {
      return new Response(JSON.stringify({ error: "Year and month are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Read baseline JSON to get all operators and their weekly schemes
    const jsonPath = path.resolve("./public/data/cronograma.json");
    const jsonRaw = await fs.readFile(jsonPath, "utf-8");
    const baseline = JSON.parse(jsonRaw);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 2. Generate and write schedules for all operators
    for (const op of baseline) {
      const agentName = op.nombre;
      
      // Delete existing DB schedules for this agent and month to avoid duplicates
      await db.delete(schedules).where(
        and(
          eq(schedules.agentName, agentName),
          like(schedules.date, `${monthPrefix}-%`)
        )
      );

      // Generate day schedules
      const inserts = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        // Initialize empty/blank (Franco modality, empty schedule)
        inserts.push({
          agentName,
          date: dateStr,
          status: "Franco",
          comment: "",
          horario: "",
        });
      }

      // Insert all generated schedules for this operator
      if (inserts.length > 0) {
        await db.insert(schedules).values(inserts);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST Months API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { year, month } = body; // month is 0-indexed (0 = Enero)

    if (year === undefined || month === undefined) {
      return new Response(JSON.stringify({ error: "Year and month are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 1. Delete from database schedules for this month
    await db.delete(schedules).where(
      like(schedules.date, `${monthPrefix}-%`)
    );

    // 2. Remove keys from baseline JSON to completely remove the month if it exists there
    const jsonPath = path.resolve("./public/data/cronograma.json");
    const jsonRaw = await fs.readFile(jsonPath, "utf-8");
    const baseline = JSON.parse(jsonRaw);

    let baselineModified = false;
    for (const op of baseline) {
      if (op.asistencia) {
        const keys = Object.keys(op.asistencia);
        for (const key of keys) {
          if (key.startsWith(monthPrefix)) {
            delete op.asistencia[key];
            baselineModified = true;
          }
        }
      }
      if (op.comentarios) {
        const keys = Object.keys(op.comentarios);
        for (const key of keys) {
          if (key.startsWith(monthPrefix)) {
            delete op.comentarios[key];
            baselineModified = true;
          }
        }
      }
      if (op.horarios_dias) {
        const keys = Object.keys(op.horarios_dias);
        for (const key of keys) {
          if (key.startsWith(monthPrefix)) {
            delete op.horarios_dias[key];
            baselineModified = true;
          }
        }
      }
    }

    if (baselineModified) {
      await fs.writeFile(jsonPath, JSON.stringify(baseline, null, 2), "utf-8");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("DELETE Months API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
