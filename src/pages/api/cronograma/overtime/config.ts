import type { APIRoute } from "astro";
import { db } from "@/db";
import { weekendOvertimeConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

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
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("GET overtime config API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

import { requireWriteAccess } from "@/lib/rbac-middleware";

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
    if (existing.length > 0) {
      await db
        .update(weekendOvertimeConfig)
        .set({ referente })
        .where(eq(weekendOvertimeConfig.id, existing[0].id));
    } else {
      await db
        .insert(weekendOvertimeConfig)
        .values({ weekendStartDate, referente });
    }
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("POST overtime config API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
