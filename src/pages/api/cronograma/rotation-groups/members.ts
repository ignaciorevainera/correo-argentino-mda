import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agentSaturdayGroups, agents } from "@db/schema";
import { and, eq } from "drizzle-orm";

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const VALID_GROUPS = ["A", "B", "C", "D"];

import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Malformed JSON body" }, 400);
    }

    const { agentId, saturdayGroup, saturdayHorario, month } = body;

    if (agentId === undefined || agentId === null) {
      return jsonResponse({ error: "Missing agentId" }, 400);
    }

    if (!month || typeof month !== "string" || !MONTH_REGEX.test(month)) {
      return jsonResponse({ error: "Invalid or missing month. Expected YYYY-MM" }, 400);
    }

    const parsedAgentId = typeof agentId === "string" ? parseInt(agentId, 10) : agentId;

    if (typeof parsedAgentId !== "number" || isNaN(parsedAgentId)) {
      return jsonResponse({ error: "Invalid agentId. Expected a number" }, 400);
    }

    if (saturdayGroup !== null && saturdayGroup !== undefined && !VALID_GROUPS.includes(saturdayGroup)) {
      return jsonResponse({ error: "Invalid saturdayGroup. Expected A, B, C, D or null" }, 400);
    }

    if (saturdayHorario !== null && saturdayHorario !== undefined && typeof saturdayHorario !== "string") {
      return jsonResponse({ error: "Invalid saturdayHorario. Expected string or null" }, 400);
    }

    // Verificar existencia del agente
    const agentList = await db
      .select()
      .from(agents)
      .where(eq(agents.id, parsedAgentId))
      .limit(1);
    
    if (agentList.length === 0) {
      return jsonResponse({ error: "Agent not found" }, 404);
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

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST rotation-groups members API Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
