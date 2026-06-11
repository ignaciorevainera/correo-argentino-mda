import { db } from "../src/db";
import { weekendOvertimeConfig, weekendOvertimeShifts } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function test() {
  console.log("Testing migration...");
  await db.insert(weekendOvertimeConfig).values({
    weekendStartDate: "2026-06-06",
    referente: "Arce Franco"
  }).onConflictDoUpdate({
    target: weekendOvertimeConfig.weekendStartDate,
    set: { referente: "Arce Franco" }
  });
  const configs = await db.select().from(weekendOvertimeConfig);
  console.log("Configs:", configs);
  
  await db.delete(weekendOvertimeConfig).where(eq(weekendOvertimeConfig.weekendStartDate, "2026-06-06"));
  console.log("Migration test complete!");
}
test();
