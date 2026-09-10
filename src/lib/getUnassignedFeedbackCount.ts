import { db } from "@/db";
import { feedback } from "@/db/schema";
import { and, eq, isNull, count } from "drizzle-orm";

export async function getUnassignedFeedbackCount(): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(feedback)
    .where(
      and(isNull(feedback.assignedToId), eq(feedback.status, "pendiente")),
    );
  return result[0]?.value ?? 0;
}
