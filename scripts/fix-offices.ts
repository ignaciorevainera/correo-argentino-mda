import { db } from "../src/db/index";
import { offices } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { normalizeSearchValue } from "../src/lib/clientSearch";

async function main() {
  console.log("[Fix] Iniciando corrección de oficinas corruptas...");

  // 1. Corregir B4813
  console.log("[Fix] Actualizando B4813 (ID 1057)...");
  await db.update(offices)
    .set({
      address: "CONESA 1540",
      street: "CONESA",
      number: "1540",
      locality: "PIÑEYRO",
      county: "AVELLANEDA",
      zone: "ZONA 3",
      searchableText: normalizeSearchValue("B4813 PIÑEYRO MILLA SUR LOGISTICA PIÑEYRO B0083 CONESA 1540")
    })
    .where(eq(offices.id, 1057));

  // 2. Corregir L3209
  console.log("[Fix] Actualizando L3209 (ID 3058)...");
  await db.update(offices)
    .set({
      address: "DE LOS INMIGRANTES 0",
      street: "DE LOS INMIGRANTES",
      number: "0",
      locality: "EMBAJADOR MARTINI",
      county: "REALICO",
      zone: "ZONA 10",
      searchableText: normalizeSearchValue("L3209 UP Nº 2 - EMBAJADOR MARTINI EMBAJADOR MARTINI L0038 DE LOS INMIGRANTES 0")
    })
    .where(eq(offices.id, 3058));

  console.log("[Fix] Corrección completada con éxito.");
}

main().catch(console.error);
