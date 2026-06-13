import type { APIRoute } from "astro";
import { db } from "@/db";
import { agentSaturdayGroups, agents } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const VALID_GROUPS = ["A", "B", "C", "D"];

export const POST: APIRoute = async ({ request }) => {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { agentId, saturdayGroup, saturdayHorario, month } = body;

    if (agentId === undefined || agentId === null) {
      return new Response(JSON.stringify({ error: "Missing agentId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!month || typeof month !== "string" || !MONTH_REGEX.test(month)) {
      return new Response(JSON.stringify({ error: "Invalid or missing month. Expected YYYY-MM" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedAgentId = typeof agentId === "string" ? parseInt(agentId, 10) : agentId;

    if (typeof parsedAgentId !== "number" || isNaN(parsedAgentId)) {
      return new Response(JSON.stringify({ error: "Invalid agentId. Expected a number" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (saturdayGroup !== null && saturdayGroup !== undefined && !VALID_GROUPS.includes(saturdayGroup)) {
      return new Response(JSON.stringify({ error: "Invalid saturdayGroup. Expected A, B, C, D or null" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (saturdayHorario !== null && saturdayHorario !== undefined && typeof saturdayHorario !== "string") {
      return new Response(JSON.stringify({ error: "Invalid saturdayHorario. Expected string or null" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verificar existencia del agente
    const agentList = await db
      .select()
      .from(agents)
      .where(eq(agents.id, parsedAgentId))
      .limit(1);
    
    if (agentList.length === 0) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Buscar si ya existe una asignación para este operador y mes
    const existing = await db
      .select()
      .from(agentSaturdayGroups)
      .where(
        and(
          eq(agentSaturdayGroups.agentId, parsedAgentId),
          eq(agentSaturdayGroups.month, month)
        )
      )
      .limit(1);

    const existingGroup = existing[0];

    if (existingGroup) {
      await db
        .update(agentSaturdayGroups)
        .set({
          saturdayGroup: saturdayGroup !== undefined ? (saturdayGroup || null) : existingGroup.saturdayGroup,
          saturdayHorario: saturdayHorario !== undefined ? (saturdayHorario || null) : existingGroup.saturdayHorario,
        })
        .where(eq(agentSaturdayGroups.id, existingGroup.id));
    } else {
      await db
        .insert(agentSaturdayGroups)
        .values({
          agentId: parsedAgentId,
          month,
          saturdayGroup: saturdayGroup || null,
          saturdayHorario: saturdayHorario || null,
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST rotation-groups members API Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
