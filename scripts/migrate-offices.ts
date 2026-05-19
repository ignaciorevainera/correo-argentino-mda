import { db } from "../src/db/index";
import {
  offices,
  contacts,
  officeContacts,
  officeAssets,
} from "../src/db/schema";
import { mockTelegrafia } from "../src/data/mock_telegrafia";
import { eq, and, isNull } from "drizzle-orm";

async function runMigration() {
  console.log("🚀 Iniciando migración de Oficinas a la Base de Datos...");
  console.log(`📦 Total de oficinas a procesar: ${mockTelegrafia.length}\n`);

  console.log("🗑️  Limpiando tablas existentes...");
  await db.delete(officeContacts);
  await db.delete(officeAssets);
  await db.delete(contacts);
  await db.delete(offices);
  console.log("   Tablas limpiadas.\n");

  let totalOffices = 0;
  let totalContactsCreated = 0;
  let totalContactsReused = 0;
  let totalRelations = 0;
  let totalAssets = 0;
  let errors = 0;

  for (const officeData of mockTelegrafia) {
    try {
      console.log(
        `📍 [${totalOffices + 1}/${mockTelegrafia.length}] Procesando: ${officeData.name} (${officeData.code})`,
      );

      const [insertedOffice] = await db
        .insert(offices)
        .values({
          code: officeData.code,
          name: officeData.name,
          type: officeData.type,
          region: officeData.region || null,
          address: officeData.address || null,
          lat: officeData.lat || null,
          lng: officeData.lng || null,
          email: officeData.email || null,
          notes: officeData.notes || null,
        })
        .returning({ id: offices.id });

      const officeId = insertedOffice.id;
      totalOffices++;

      for (const c of officeData.contacts) {
        const normalizedPhone = c.phone?.trim() || null;
        let contactId: number;

        const existingContacts = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.name, c.name),
              normalizedPhone !== null
                ? eq(contacts.phone, normalizedPhone)
                : isNull(contacts.phone),
            ),
          );

        const existingContact = existingContacts[0];

        if (existingContact) {
          contactId = existingContact.id;
          totalContactsReused++;
          console.log(`   ♻️  Contacto reutilizado: ${c.name}`);
        } else {
          const [newContact] = await db
            .insert(contacts)
            .values({
              name: c.name,
              phone: normalizedPhone,
            })
            .returning({ id: contacts.id });
          contactId = newContact.id;
          totalContactsCreated++;
          console.log(`   ✨ Contacto creado: ${c.name}`);
        }

        await db.insert(officeContacts).values({
          officeId: officeId,
          contactId: contactId,
          role: c.role || null,
          timeSlot: c.timeSlot || null,
        });
        totalRelations++;
      }

      for (const asset of officeData.assets) {
        await db.insert(officeAssets).values({
          officeId: officeId,
          type: asset.type,
          hostname: asset.hostname || null,
          ip: asset.ip || null,
        });
        totalAssets++;
      }
    } catch (error) {
      errors++;
      console.error(
        `   ❌ Error procesando ${officeData.name} (${officeData.code}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMEN DE MIGRACIÓN");
  console.log("═".repeat(50));
  console.log(`   Oficinas insertadas:      ${totalOffices}`);
  console.log(`   Contactos creados:        ${totalContactsCreated}`);
  console.log(`   Contactos reutilizados:   ${totalContactsReused}`);
  console.log(`   Relaciones office↔contact: ${totalRelations}`);
  console.log(`   Activos insertados:       ${totalAssets}`);
  console.log(`   Errores:                  ${errors}`);
  console.log("═".repeat(50));

  if (errors === 0) {
    console.log("✅ ¡Migración completada con éxito!");
  } else {
    console.log(`⚠️  Migración completada con ${errors} error(es).`);
  }
}

runMigration().catch((error) => {
  console.error("❌ Error fatal durante la migración:", error);
  process.exit(1);
});
