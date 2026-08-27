import { db } from "../src/db/index";
import { users } from "../src/db/schema";
import { isNull } from "drizzle-orm";
import { MDA_TI_HELPDESK } from "../src/lib/helpdeskAccess";

const result = await db
  .update(users)
  .set({ helpdeskName: MDA_TI_HELPDESK })
  .where(isNull(users.helpdeskName));

console.log(
  `Backfill: ${result.changes} usuarios asignados a ${MDA_TI_HELPDESK}`,
);
