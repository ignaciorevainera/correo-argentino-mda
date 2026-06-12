import { db } from "../src/db/index";
import { offices, terminals, supportGuides } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { normalizeSearchValue } from "../src/lib/clientSearch";

async function main() {
  console.log("Backfilling offices...");
  const allOffices = await db.select().from(offices);
  for (const office of allOffices) {
    const textToSearch = [office.code, office.name, office.locality, office.parentNis, office.address].filter(Boolean).join(" ");
    const normalized = normalizeSearchValue(textToSearch);
    await db.update(offices).set({ searchableText: normalized }).where(eq(offices.id, office.id));
  }

  console.log("Backfilling terminals...");
  const allTerminals = await db.select().from(terminals);
  for (const terminal of allTerminals) {
    const textToSearch = [terminal.hostname, terminal.ipAddress, terminal.macAddress].filter(Boolean).join(" ");
    const normalized = normalizeSearchValue(textToSearch);
    await db.update(terminals).set({ searchableText: normalized }).where(eq(terminals.id, terminal.id));
  }

  console.log("Backfilling support guides...");
  const allGuides = await db.select().from(supportGuides);
  for (const guide of allGuides) {
    const textToSearch = [guide.helpDeskName, guide.invgateName, guide.route, guide.topics].filter(Boolean).join(" ");
    const normalized = normalizeSearchValue(textToSearch);
    await db.update(supportGuides).set({ searchableText: normalized }).where(eq(supportGuides.id, guide.id));
  }

  console.log("Backfill complete!");
}

main().catch(console.error);
