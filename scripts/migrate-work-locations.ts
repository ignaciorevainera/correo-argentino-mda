import Database from "better-sqlite3";

const sqlite = new Database("./database/mda.db");

console.log("🔧 Ejecutando migración: work_locations + operators.location_id...");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS work_locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
`);

const columns = sqlite
  .prepare("PRAGMA table_info(operators)")
  .all() as { name: string }[];

const hasLocationId = columns.some((c) => c.name === "location_id");

if (!hasLocationId) {
  sqlite.exec(`
    ALTER TABLE operators ADD COLUMN location_id TEXT REFERENCES work_locations(id);
  `);
  console.log("✅ Columna location_id agregada a operators.");
} else {
  console.log("ℹ️  Columna location_id ya existe en operators.");
}

console.log("✅ Migración completada.");
sqlite.close();
