import type { APIRoute } from "astro";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const agentName = url.searchParams.get("agentName");

    if (!agentName) {
      return new Response(JSON.stringify({ error: "Missing agentName parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Lookup agent in database case-insensitively
    const agent = await db
      .select()
      .from(agents)
      .where(eq(sql`lower(${agents.name})`, agentName.trim().toLowerCase()))
      .limit(1);

    if (agent.length === 0) {
      // Dynamic fallback creation to ensure operator exists in SQLite
      const parts = agentName.trim().split(/\s+/);
      const initials = parts
        .map((p: string) => p[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      await db.insert(agents).values({
        name: agentName,
        avatarInitials: initials,
        notes: "",
      });

      return new Response(JSON.stringify({ notes: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ notes: agent[0].notes || "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Notes API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

import { requireWriteAccess } from "@/lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { agentName, notes } = body;

    if (!agentName) {
      return new Response(JSON.stringify({ error: "Missing agentName in request body" }), {
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
        .set({ notes })
        .where(eq(agents.id, agent[0].id));
    } else {
      // Create new agent with these notes
      const parts = agentName.trim().split(/\s+/);
      const initials = parts
        .map((p: string) => p[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      await db.insert(agents).values({
        name: agentName,
        avatarInitials: initials,
        notes,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST Notes API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
