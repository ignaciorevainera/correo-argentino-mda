import type { APIRoute } from "astro";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

import { requireWriteAccess } from "@/lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { agentName, maxConsecutiveHO, minPWeek } = body;

    if (!agentName) {
      return new Response(
        JSON.stringify({ error: "El nombre del operador es requerido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const agent = await db
      .select()
      .from(agents)
      .where(eq(sql`lower(${agents.name})`, agentName.trim().toLowerCase()))
      .limit(1);

    if (agent.length > 0) {
      await db
        .update(agents)
        .set({
          maxConsecutiveHO:
            maxConsecutiveHO === "" || maxConsecutiveHO === null || maxConsecutiveHO === undefined
              ? null
              : parseInt(maxConsecutiveHO),
          minPWeek:
            minPWeek === "" || minPWeek === null || minPWeek === undefined
              ? null
              : parseInt(minPWeek),
        })
        .where(eq(agents.id, agent[0].id));

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Operador no encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("POST Rules API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
