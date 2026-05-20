import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../src/db/index"; // Ajusta esta ruta si es necesario
import { resourceCategories, resourceLinks } from "../src/db/schema";

function importRecursos() {
  console.log("[Importer] Procesando enlaces y recursos...");

  const jsonPath = resolve(process.cwd(), "src/data/enlaces_recursos.json");
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

  try {
    // Para better-sqlite3 la transacción DEBE ser síncrona (sin async)
    db.transaction((tx) => {
      for (const cat of data) {
        console.log(` -> Insertando categoría: ${cat.title}`);

        // 1. Insertar categoría. Usamos .run() en lugar de await
        tx.insert(resourceCategories)
          .values({
            id: cat.id,
            title: cat.title,
            iconName: cat.iconName,
          })
          .onConflictDoNothing()
          .run();

        // 2. Insertar enlaces asociados
        for (const link of cat.links) {
          tx.insert(resourceLinks)
            .values({
              id: link.id,
              categoryId: cat.id,
              title: link.title,
              url: link.url,
              subtitle: link.subtitle || null,
            })
            .onConflictDoNothing()
            .run();
        }
      }
    });

    console.log("\n[Importer] 🎉 Recursos migrados exitosamente a la DB.");
  } catch (error) {
    console.error("\n[Importer] ❌ Error durante la migración:");
    console.error(error);
  }
}

importRecursos();
