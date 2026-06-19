import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const DB_PATH = resolve("database/mda.db");
const MIGRATION_PATH = resolve("drizzle/0002_yielding_fantastic_four.sql");
const JOURNAL_PATH = resolve("drizzle/meta/_journal.json");

function checkMismatch(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT type FROM pragma_table_info('application_categories') WHERE name='id'")
    .get() as { type: string } | undefined;
  return row?.type?.toUpperCase() === "TEXT";
}

function applyMigration(db: Database.Database): void {
  console.log("[Fix] Aplicando migración 0002...");
  const sql = readFileSync(MIGRATION_PATH, "utf-8");
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(sql);
  db.exec("PRAGMA foreign_keys = ON;");
  console.log("[Fix] Migración 0002 aplicada correctamente.");
}

function updateJournal(): void {
  const journalPath = resolve(JOURNAL_PATH);
  const raw = readFileSync(journalPath, "utf-8");
  const journal = JSON.parse(raw);
  const has0002 = journal.entries.some((e: { tag: string }) => e.tag === "0002_yielding_fantastic_four");
  if (!has0002) {
    journal.entries.push({
      idx: 2,
      version: "6",
      when: Date.now(),
      tag: "0002_yielding_fantastic_four",
      breakpoints: true,
    });
    writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
    console.log("[Fix] _journal.json actualizado con entry de 0002.");
  } else {
    console.log("[Fix] _journal.json ya tiene el entry de 0002.");
  }
}

function run(): void {
  if (!readFileSync(DB_PATH, { flag: "r" })) {
    console.error("[Fix] No se encuentra database/mda.db");
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  if (!checkMismatch(db)) {
    console.log("[Fix] No se detecta mismatch. La BD ya está en sync con el schema.");
    db.close();
    return;
  }

  applyMigration(db);
  db.close();
  updateJournal();

  const verify = new Database(DB_PATH);
  if (checkMismatch(verify)) {
    console.error("[Fix] Error: el mismatch persiste después de aplicar la migración.");
    verify.close();
    process.exit(1);
  }
  verify.close();
  console.log("[Fix] Todo en orden. Ya podés ejecutar npx drizzle-kit push sin errores.");
}

run();
