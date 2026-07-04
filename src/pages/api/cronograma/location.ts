import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { agentName, location } = body;

    if (!agentName) {
      return jsonResponse({ error: "Missing agentName in request body" }, 400);
    }

    if (location !== "Monte Grande" && location !== "Parque Patricios") {
      return jsonResponse({ error: "Invalid location value" }, 400);
    }

    // Case-insensitive lookup
    const agent = await db.select({ id: agents.id })
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

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Location API Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
