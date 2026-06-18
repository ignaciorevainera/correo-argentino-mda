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
    const { agentName, location } = body;

    if (!agentName) {
      return new Response(JSON.stringify({ error: "Missing agentName in request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (location !== "Monte Grande" && location !== "Parque Patricios") {
      return new Response(JSON.stringify({ error: "Invalid location value" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Case-insensitive lookup
    const agent = await db
      .select()
      .from(agents)
      .where(eq(sql`lower(${agents.name})`, agentName.trim().toLowerCase()))
      .limit(1);

    if (agent.length > 0) {
      // Update by primary key ID for safety
      await db
        .update(agents)
        .set({ location })
        .where(eq(agents.id, agent[0].id));
    } else {
      // Create new agent with this location
      const parts = agentName.trim().split(/\s+/);
      const initials = parts
        .map((p: string) => p[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      await db.insert(agents).values({
        name: agentName,
        avatarInitials: initials,
        location,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST Location API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
