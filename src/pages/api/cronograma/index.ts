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
      const newHorariosDias: Record<string, string> = {};

      // Load specific DB overrides first
      opOverrides.forEach((s) => {
        if (s.status === "Franco" || s.status === "") {
          newAsistencia[s.date] = "Franco";
        } else {
          newAsistencia[s.date] = s.status;
        }
        if (s.comment) {
          newComentarios[s.date] = s.comment;
        }
        if (s.horario !== undefined && s.horario !== null) {
          newHorariosDias[s.date] = s.horario;
        }
      });

      // Fill in default hours for any dates that exist in newAsistencia
      const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
      Object.keys(newAsistencia).forEach(dateStr => {
        if (newHorariosDias[dateStr] === undefined) {
          const dateObj = new Date(dateStr + "T12:00:00");
          const dayName = dayNames[dateObj.getDay()];
          const status = newAsistencia[dateStr];
          
          if (operator.esquema_horario?.[dayName]) {
            newHorariosDias[dateStr] = operator.esquema_horario[dayName];
          } else if (status !== "Franco") {
            newHorariosDias[dateStr] = operator.horario || "08:00 - 17:00";
          } else {
            newHorariosDias[dateStr] = "";
          }
        }
      });

      return {
        ...operator,
        asistencia: newAsistencia,
        comentarios: newComentarios,
        horarios_dias: newHorariosDias,
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
    const { edits, weeklySchedules } = body; // Array of { agentName, date, status, comment, horario } or weeklySchedules

    if (weeklySchedules && Array.isArray(weeklySchedules)) {
      const jsonPath = path.resolve("./public/data/cronograma.json");
      const jsonRaw = await fs.readFile(jsonPath, "utf-8");
      const baseline = JSON.parse(jsonRaw);

      for (const ws of weeklySchedules) {
        const { agentName, esquema_semanal, esquema_horario } = ws;
        if (!agentName) continue;
        const op = baseline.find((o: any) => o.nombre === agentName);
        if (op) {
          if (esquema_semanal !== undefined) {
            op.esquema_semanal = esquema_semanal;
          }
          if (esquema_horario !== undefined) {
            op.esquema_horario = esquema_horario;
          }
        }
      }

      await fs.writeFile(jsonPath, JSON.stringify(baseline, null, 2), "utf-8");

      if (!edits || !Array.isArray(edits)) {
        return new Response(JSON.stringify({ success: true, message: "Weekly schedules updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (!Array.isArray(edits)) {
      return new Response(JSON.stringify({ error: "Edits must be an array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process each edit
    for (const edit of edits) {
      const { agentName, date, status, comment, horario } = edit;
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
        if (horario !== undefined) updateData.horario = horario;

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
          horario: horario || "",
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
