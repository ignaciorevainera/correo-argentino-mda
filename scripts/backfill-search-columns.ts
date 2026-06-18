import { db } from "../src/db/index";
import { offices, terminals, supportGuides, provinces } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { normalizeSearchValue } from "../src/lib/clientSearch";

async function main() {
  const allProvinces = await db.select().from(provinces);
  const provMap = new Map(allProvinces.map(p => [p.code, p.name]));

  console.log("Backfilling offices...");
  const allOffices = await db.select().from(offices);
  for (const office of allOffices) {
    const provName = provMap.get(office.provinceCode) || "";
    const textToSearch = [office.code, office.name, office.locality, office.parentNis, office.address, provName].filter(Boolean).join(" ");
    const normalized = normalizeSearchValue(textToSearch);
    await db.update(offices).set({ searchableText: normalized }).where(eq(offices.id, office.id));
  }

  console.log("Backfilling terminals...");
  const allTerminals = await db.select().from(terminals);
  for (const terminal of allTerminals) {
    let displayArch = "";
    if (terminal.osArchitecture) {
      if (terminal.osArchitecture.includes("64")) {
        displayArch = "64 bits";
      } else if (terminal.osArchitecture.includes("32") || terminal.osArchitecture.includes("86")) {
        displayArch = "32 bits";
      } else {
        displayArch = terminal.osArchitecture;
      }
    }
    const textToSearch = [
      terminal.hostname,
      terminal.ipAddress,
      terminal.macAddress,
      terminal.manufacturer,
      terminal.model,
      terminal.serialNumber,
      terminal.operatingSystem,
      terminal.osArchitecture,
      displayArch,
      terminal.ram
    ].filter(Boolean).join(" ");
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
