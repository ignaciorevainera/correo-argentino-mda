import { db } from "../src/db";
import { resourceCategories, resourceLinks } from "../src/db/schema";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const filePath = path.join(process.cwd(), "src", "data", "enlaces_recursos.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  const categories = JSON.parse(rawData);

  console.log("Iniciando importación de recursos y enlaces...");

  await db.transaction(async (tx) => {
    for (const cat of categories) {
      console.log(`Insertando categoría: ${cat.title}`);
      
      await tx.insert(resourceCategories).values({
        id: cat.id,
        title: cat.title,
        iconName: cat.iconName,
      });

      for (const link of cat.links) {
        console.log(`  - Insertando enlace: ${link.title}`);
        await tx.insert(resourceLinks).values({
          id: link.id,
          categoryId: cat.id,
          title: link.title,
          url: link.url,
          subtitle: link.subtitle || null,
        });
      }
    }
  });

  console.log("Importación finalizada con éxito.");
}

main().catch((err) => {
  console.error("Error durante la importación:", err);
  process.exit(1);
});
