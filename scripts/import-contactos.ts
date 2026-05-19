import { db } from "../src/db";
import { contactCategories, providerContacts } from "../src/db/schema";
import { usefulContactCategories } from "../src/data/contactos";

async function main() {
  console.log("Iniciando importación de contactos a SQLite...");

  try {
    console.log("Limpiando tablas de contactos...");
    await db.delete(providerContacts);
    await db.delete(contactCategories);

    for (const category of usefulContactCategories) {
      console.log(`Insertando categoría: ${category.title} (${category.id})`);
      
      await db.insert(contactCategories).values({
        id: category.id,
        title: category.title,
        icon: category.icon,
        tone: category.tone,
      });

      if (category.contacts && category.contacts.length > 0) {
        console.log(`  -> Insertando ${category.contacts.length} contactos para ${category.title}...`);
        
        const contactsToInsert = category.contacts.map(c => ({
          id: c.id,
          categoryId: category.id,
          provider: c.provider,
          service: c.service,
          phones: c.phones,
          emails: c.emails,
          urls: c.urls,
        }));

        await db.insert(providerContacts).values(contactsToInsert);
      }
    }
    
    console.log("¡Importación completada con éxito!");
  } catch (error) {
    console.error("Ocurrió un error durante la importación:", error);
    process.exit(1);
  }
}

main();
