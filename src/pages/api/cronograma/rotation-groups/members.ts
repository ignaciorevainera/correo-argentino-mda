import type { APIRoute } from "astro";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { agentId, saturdayGroup, saturdayHorario } = await request.json();

    if (agentId === undefined || agentId === null) {
      return new Response(JSON.stringify({ error: "Missing agentId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedAgentId = typeof agentId === "string" ? parseInt(agentId, 10) : agentId;

    if (isNaN(parsedAgentId)) {
      return new Response(JSON.stringify({ error: "Invalid agentId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db
      .update(agents)
      .set({
        saturdayGroup: saturdayGroup || null,
        saturdayHorario: saturdayHorario || null,
      })
      .where(eq(agents.id, parsedAgentId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST rotation-groups members API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
