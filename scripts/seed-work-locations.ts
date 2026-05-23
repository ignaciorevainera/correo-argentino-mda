import { db } from "../src/db/index";
import { workLocations, operators } from "../src/db/schema";
import { ne, and } from "drizzle-orm";

async function seedWorkLocations() {
  console.log("🚀 Insertando ubicaciones de trabajo...");

  const locations = [
    { id: "MGR", name: "Planta Monte Grande" },
    { id: "PP", name: "Parque Patricios" },
  ];

  for (const loc of locations) {
    await db.insert(workLocations).values(loc).onConflictDoNothing();
  }

  await db.update(operators).set({ locationId: "MGR" });

  await db
    .delete(workLocations)
    .where(and(ne(workLocations.id, "MGR"), ne(workLocations.id, "PP")));

  console.log("✅ Ubicaciones de trabajo cargadas.");
}

seedWorkLocations().catch(console.error);
