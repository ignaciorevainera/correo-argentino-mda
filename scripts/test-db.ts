import { db } from "../src/db/index";
import { offices } from "../src/db/schema";
import { eq, like } from "drizzle-orm";
import { searchOffices } from "../src/lib/clientSearch";

async function run() {
  console.log("=== Comprobando primera oficina con datos SAP ===");
  const testOffice = await db.select().from(offices).where(eq(offices.code, "7")).limit(1);
  if (testOffice.length) {
    const o = testOffice[0];
    console.log(`Oficina: ${o.name} (${o.code})`);
    console.log(`Payroll: ${o.payroll}, TaxExempt: ${o.taxExempt}`);
    console.log(`Division: ${o.division}, Company: ${o.company}`);
    console.log(`CC Comercial: ${o.ccCommercial}`);
    console.log(`PV Manual: ${o.posManual}`);
  } else {
    console.log("No se encontró la oficina con code=7 (CÓRDOBA)");
  }

  console.log("\n=== Probando búsqueda FTS ===");
  // 'córd' should find CÓRDOBA
  const results = await searchOffices("córd");
  console.log(`Se encontraron ${results.length} resultados.`);
  if (results.length > 0) {
    console.log(`Primer resultado: ${results[0].name} (${results[0].code})`);
  }
}

run().catch(console.error);
