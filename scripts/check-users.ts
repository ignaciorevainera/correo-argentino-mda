import { db } from "../src/db/index";
import { users } from "../src/db/schema";
import { hasPermission } from "../src/lib/rbac";

async function main() {
  const allUsers = await db.select().from(users);
  console.log("Users in DB:", JSON.stringify(allUsers, null, 2));

  console.log("hasPermission('/admin', 'team_leader') =", hasPermission('/admin', 'team_leader'));
  console.log("hasPermission('/admin/', 'team_leader') =", hasPermission('/admin/', 'team_leader'));
  console.log("hasPermission('/admin/oficinas', 'team_leader') =", hasPermission('/admin/oficinas', 'team_leader'));
}

main().catch(console.error);
