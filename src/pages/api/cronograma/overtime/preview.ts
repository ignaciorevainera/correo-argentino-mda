import type { APIRoute } from "astro";
import { db } from "@db/index";
import { weekendOvertimeShifts, agents } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import { sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";

interface ShiftEntry {
  agentId: number;
  agentName: string;
  day: "saturday" | "sunday";
  startTime: string;
  endTime: string;
  hours: number;
}

interface WeekendGroup {
  startDate: string;
  saturdayDate: string;
  sundayDate: string;
  totalHours: number;
  operatorCount: number;
  currentUserHasShift: boolean;
  shifts: ShiftEntry[];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getSaturdaysInMonth(year: number, month: number): string[] {
  const saturdays: string[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    if (date.getDay() === 6) {
      saturdays.push(date.toISOString().slice(0, 10));
    }
    date.setDate(date.getDate() + 1);
  }
  return saturdays;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireReadAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const month = url.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return new Response(
        JSON.stringify({ error: "month parameter is required and must be in YYYY-MM format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const currentUserId = locals.user!.id;
    const currentUser = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.username, locals.user!.username))
      .limit(1);
    const currentAgentId = currentUser[0]?.id ?? null;
    const respondedUserId = currentAgentId ?? currentUserId;

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    const saturdays = getSaturdaysInMonth(year, monthNum);

    if (saturdays.length === 0) {
      return new Response(
        JSON.stringify({ weekends: [], currentUserId: respondedUserId, month }),
        { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    const rows = await db
      .select({
        weekendStartDate: weekendOvertimeShifts.weekendStartDate,
        agentId: weekendOvertimeShifts.agentId,
        date: weekendOvertimeShifts.date,
        startTime: weekendOvertimeShifts.startTime,
        endTime: weekendOvertimeShifts.endTime,
        agentName: agents.name,
      })
      .from(weekendOvertimeShifts)
      .leftJoin(agents, eq(weekendOvertimeShifts.agentId, agents.id))
      .where(inArray(weekendOvertimeShifts.weekendStartDate, saturdays));

    const grouped = new Map<string, WeekendGroup>();

    for (const sat of saturdays) {
      const satDate = new Date(sat + "T12:00:00");
      const sunDate = new Date(satDate);
      sunDate.setDate(sunDate.getDate() + 1);
      const sundayStr = sunDate.toISOString().slice(0, 10);

      grouped.set(sat, {
        startDate: sat,
        saturdayDate: sat,
        sundayDate: sundayStr,
        totalHours: 0,
        operatorCount: 0,
        currentUserHasShift: false,
        shifts: [],
      });
    }

    for (const row of rows) {
      const group = grouped.get(row.weekendStartDate);
      if (!group) continue;

      const startMinutes = timeToMinutes(row.startTime);
      let endMinutes = timeToMinutes(row.endTime);
      if (endMinutes < startMinutes) {
        endMinutes += 1440;
      }
      const hours = Math.round(((endMinutes - startMinutes) / 60) * 10) / 10;

      const day: "saturday" | "sunday" =
        row.date === row.weekendStartDate ? "saturday" : "sunday";

      group.shifts.push({
        agentId: row.agentId,
        agentName: row.agentName ?? "Unknown",
        day,
        startTime: row.startTime,
        endTime: row.endTime,
        hours,
      });

      group.totalHours = Math.round((group.totalHours + hours) * 10) / 10;

      if (currentAgentId !== null && row.agentId === currentAgentId) {
        group.currentUserHasShift = true;
      }
    }

    for (const group of grouped.values()) {
      const distinctAgents = new Set(group.shifts.map((s) => s.agentId));
      group.operatorCount = distinctAgents.size;
    }

    const weekends = Array.from(grouped.values()).sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );

    return new Response(
      JSON.stringify({ weekends, currentUserId: respondedUserId, month }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: unknown) {
    console.error("GET overtime preview API Error:", error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
