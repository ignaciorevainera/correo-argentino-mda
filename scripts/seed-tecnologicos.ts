import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../src/db";
import { technologyReferents } from "../src/db/schema";

async function main() {
  console.log("Seeding technology referents...");
  
  const csvPath = resolve("src/data/Tecnológicos.csv");
  const content = readFileSync(csvPath, "utf-8");
  
  // Split content by newline
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
  
  // Skip the header: "Nombre;Apellido;Región"
  const dataLines = lines.slice(1);
  
  const regionMap: Record<string, string> = {
    "PBA - La Pampa": "PBA-LP",
    "Sur": "SUR",
    "Centro - NEA": "NEA",
    "Cuyo - NOA": "NOA"
  };

  const recordsToInsert = [];

  for (const line of dataLines) {
    const parts = line.split(";");
    if (parts.length < 3) continue;
    
    const firstName = parts[0].trim();
    const lastName = parts[1].trim();
    const csvRegion = parts[2].trim();
    
    const regionId = regionMap[csvRegion];
    if (!regionId) {
      console.warn(`Warning: unknown region map for '${csvRegion}' in line: ${line}`);
      continue;
    }
    
    recordsToInsert.push({
      firstName,
      lastName,
      regionId
    });
  }

  if (recordsToInsert.length > 0) {
    // Clear existing referents to prevent duplicates if run multiple times
    await db.delete(technologyReferents);
    
    await db.insert(technologyReferents).values(recordsToInsert);
    console.log(`Successfully seeded ${recordsToInsert.length} technology referents.`);
  } else {
    console.log("No records found to seed.");
  }
}

main().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
