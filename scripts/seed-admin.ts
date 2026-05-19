import { db } from "../src/db/index";
import { users } from "../src/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Iniciando seed de administradores...");

  const adminsToCreate = [
    { username: "irevainera", password: "irevainera", role: "admin" },
    { username: "daaltamirano1", password: "daaltamirano1", role: "admin" },
  ];

  for (const adminData of adminsToCreate) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, adminData.username))
      .get();

    if (existingUser) {
      console.log(
        `⚠️  El usuario '${adminData.username}' ya existe en la base de datos. Omitiendo.`,
      );
      continue;
    }

    const hashedPassword = await bcrypt.hash(adminData.password, 10);

    await db.insert(users).values({
      username: adminData.username,
      password: hashedPassword,
      role: adminData.role,
    });

    console.log(
      `✅ Usuario administrador '${adminData.username}' creado correctamente.`,
    );
  }

  console.log("🎉 Seed finalizado con éxito.");
}

seed().catch((error) => {
  console.error("❌ Error ejecutando el seed:", error);
  process.exit(1);
});
