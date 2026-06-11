import type { APIRoute } from "astro";
import { db } from "@/db";
import { weekendOvertimeShifts } from "@/db/schema";
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
      .from(weekendOvertimeShifts)
      .where(eq(weekendOvertimeShifts.weekendStartDate, weekendStartDate));
    return new Response(
      JSON.stringify(res),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("GET overtime shifts API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { id, weekendStartDate, agentId, date, startTime, endTime } = await request.json();
    if (!weekendStartDate || !agentId || !date || !startTime || !endTime) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (id) {
      await db
        .update(weekendOvertimeShifts)
        .set({ agentId, date, startTime, endTime })
        .where(eq(weekendOvertimeShifts.id, id));
    } else {
      await db
        .insert(weekendOvertimeShifts)
        .values({ weekendStartDate, agentId, date, startTime, endTime });
    }
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("POST overtime shifts API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const DELETE: APIRoute = async ({ url, request }) => {
  try {
    // Support id from URL query param (e.g. DELETE /shifts?id=5) or from body
    let id: number | undefined;
    const qId = url.searchParams.get("id");
    if (qId) {
      id = parseInt(qId, 10);
    } else {
      try {
        const body = await request.json();
        id = body.id;
      } catch {
        // no body
      }
    }
    if (!id) {
      return new Response(
        JSON.stringify({ error: "id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    await db.delete(weekendOvertimeShifts).where(eq(weekendOvertimeShifts.id, id));
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("DELETE overtime shifts API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// PUT: explicit update alias (same as POST with id)
export const PUT: APIRoute = async ({ request }) => {
  try {
    const { id, agentId, date, startTime, endTime } = await request.json();
    if (!id || !agentId || !date || !startTime || !endTime) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    await db
      .update(weekendOvertimeShifts)
      .set({ agentId, date, startTime, endTime })
      .where(eq(weekendOvertimeShifts.id, id));
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("PUT overtime shifts API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
