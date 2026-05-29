import Database from "better-sqlite3";
import * as path from "path";

const FIELDS_TO_UPPER = [
  "name",
  "type",
  "address",
  "street",
  "locality",
  "county",
  "zone",
  "manager",
  "email",
  "notes",
] as const;

function main() {
  const dbPath = path.resolve("./database/mda.db");
  console.log(`Connecting to DB: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  try {
    const setClauses = FIELDS_TO_UPPER.map(
      (f) => `${f} = UPPER(${f})`
    ).join(", ");

    const stmt = db.prepare(`UPDATE offices SET ${setClauses}`);
    const result = stmt.run();

    console.log(`\n✅ ${result.changes} offices normalized to uppercase.`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    db.close();
    console.log("Database connection closed.");
  }
}

main();
