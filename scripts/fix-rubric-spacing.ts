import Database from "better-sqlite3";
import * as path from "path";

function main() {
  const dbPath = path.resolve("./database/mda.db");
  console.log(`Connecting to DB: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  try {
    const stmt = db.prepare(
      "UPDATE offices SET rubric = 'SIN RUBRO (SUCURSALES)' WHERE rubric = 'SIN RUBRO ( SUCURSALES )'"
    );
    const result = stmt.run();

    console.log(`\n✅ ${result.changes} offices updated.`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    db.close();
    console.log("Database connection closed.");
  }
}

main();
