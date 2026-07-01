import { db } from "../src/db/index";
import { employees } from "../src/db/schema";
import mysql from "mysql2/promise";

const MYSQL_HOST = process.env.MIGRATE_MYSQL_HOST || "localhost";
const MYSQL_PORT = Number(process.env.MIGRATE_MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MIGRATE_MYSQL_USER || "root";
const MYSQL_PASS = process.env.MIGRATE_MYSQL_PASS || "";
const MYSQL_DB = process.env.MIGRATE_MYSQL_DB || "usuarios_habilitados";

async function migrate() {
  console.log("[Migrate] Conectando a MySQL...");
  const connection = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASS,
    database: MYSQL_DB,
  });

  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    "SELECT id, dni, fullname, username, interno, telefono, sucursal, updated_at FROM usuarios"
  );
  console.log(`[Migrate] Leídos ${rows.length} registros desde MySQL.`);

  await connection.end();

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const dni = String(row.dni || "").trim();
    const username = String(row.username || "").trim();
    const fullname = String(row.fullname || "").trim();

    if (!dni || !username) {
      skipped++;
      continue;
    }

    try {
      await db
        .insert(employees)
        .values({
          dni,
          username,
          fullname: fullname || "Desconocido",
          interno: row.interno ? String(row.interno) : null,
          telefono: row.telefono ? String(row.telefono) : null,
          sucursal: row.sucursal ? String(row.sucursal) : null,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        })
        .onConflictDoNothing({ target: employees.dni });
      inserted++;
    } catch (err) {
      console.error(`[Migrate] Error insertando ${username}:`, err);
      skipped++;
    }
  }

  console.log(`[Migrate] Completado. Insertados: ${inserted}, Omitidos: ${skipped}`);
  process.exit(0);
}

migrate();
