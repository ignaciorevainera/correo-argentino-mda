import { db } from "../src/db/index";
import { users } from "../src/db/schema";
import { eq, or } from "drizzle-orm";

async function main() {
  console.log("Normalizing Team Leader roles in the database...");
  
  // Find all users with roles "team-leader" or "team leader"
  const updated = await db
    .update(users)
    .set({ role: "team_leader" })
    .where(
      or(
        eq(users.role, "team-leader"),
        eq(users.role, "team leader")
      )
    );
  
  console.log("Database migration complete!");
}

main().catch(console.error);
