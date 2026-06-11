import { db } from "../src/db";
import { weekendOvertimeConfig, weekendOvertimeShifts, agents } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function test() {
  console.log("Testing migration...");
  
  // Get a valid agent ID
  const allAgents = await db.select().from(agents).limit(1);
  if (allAgents.length === 0) {
    console.log("No agents found in database, skipping shift test.");
  }
  const agentId = allAgents[0]?.id || 1;
  
  try {
    // Config test
    await db.insert(weekendOvertimeConfig).values({
      weekendStartDate: "2026-06-06",
      referente: "Arce Franco"
    }).onConflictDoUpdate({
      target: weekendOvertimeConfig.weekendStartDate,
      set: { referente: "Arce Franco" }
    });
    
    const configs = await db.select().from(weekendOvertimeConfig);
    console.log("Configs:", configs);
    
    if (allAgents.length > 0) {
      // Insert dummy shift
      await db.insert(weekendOvertimeShifts).values({
        weekendStartDate: "2026-06-06",
        agentId,
        date: "2026-06-06",
        startTime: "13:00",
        endTime: "17:00"
      });
      const shifts = await db.select().from(weekendOvertimeShifts);
      console.log("Shifts:", shifts);
    }
  } finally {
    await db.delete(weekendOvertimeConfig).where(eq(weekendOvertimeConfig.weekendStartDate, "2026-06-06"));
    if (allAgents.length > 0) {
      await db.delete(weekendOvertimeShifts).where(eq(weekendOvertimeShifts.weekendStartDate, "2026-06-06"));
    }
    console.log("Migration test complete!");
  }
}
test();
