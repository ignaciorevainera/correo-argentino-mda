import { db } from "../src/db";
import { officeAssets } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Iniciando actualización de hostnames de impresoras...");
  try {
    const result = await db
      .update(officeAssets)
      .set({ hostname: null })
      .where(eq(officeAssets.type, "printer"));
    
    console.log("Actualización exitosa.");
  } catch (error) {
    console.error("Error al actualizar:", error);
    process.exit(1);
  }
}

main();
