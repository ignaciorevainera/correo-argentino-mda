import type { APIRoute } from "astro";
import { db } from "@db/index";
import { weekendOvertimeConfig } from "@db/schema";
import { eq } from "drizzle-orm";
import { sanitizeError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ url }) => {
  try {
    const weekendStartDate = url.searchParams.get("weekendStartDate");
    if (!weekendStartDate) {
      return new Response(
        JSON.stringify({ error: "weekendStartDate is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const res = await db
      .select()
      .from(weekendOvertimeConfig)
      .where(eq(weekendOvertimeConfig.weekendStartDate, weekendStartDate))
      .limit(1);
    return new Response(
      JSON.stringify(res[0] || { referente: "" }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    console.error("GET overtime config API Error:", error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const { weekendStartDate, referente } = await request.json();
    if (!weekendStartDate || referente === undefined) {
      return new Response(
        JSON.stringify({ error: "Missing fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const existing = await db
      .select()
      .from(weekendOvertimeConfig)
      .where(eq(weekendOvertimeConfig.weekendStartDate, weekendStartDate))
      .limit(1);
    let configId = 0;
    if (existing.length > 0) {
      configId = existing[0].id;
      await db
        .update(weekendOvertimeConfig)
        .set({ referente })
        .where(eq(weekendOvertimeConfig.id, configId));
    } else {
      const inserted = await db
        .insert(weekendOvertimeConfig)
        .values({ weekendStartDate, referente })
        .returning();
      configId = inserted[0]?.id || 0;
    }
    return new Response(
      JSON.stringify({ id: configId, weekendStartDate, referente }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("POST overtime config API Error:", error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
