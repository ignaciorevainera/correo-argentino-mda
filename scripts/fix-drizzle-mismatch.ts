import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const DB_PATH = resolve("database/mda.db");
const JOURNAL_PATH = resolve("drizzle/meta/_journal.json");
const MIGRATIONS = [
  "0000_motionless_selene",
  "0001_exotic_roxanne_simpson",
  "0002_yielding_fantastic_four",
];

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  return !!row;
}

function columnType(db: Database.Database, table: string, col: string): string | null {
  const row = db
    .prepare("SELECT type FROM pragma_table_info(?) WHERE name=?")
    .get(table, col) as { type: string } | undefined;
  return row?.type ?? null;
}

function appliedMigrations(journal: { entries: { tag: string }[] }): Set<string> {
  return new Set(journal.entries.map((e) => e.tag));
}

function readJournal(): { entries: { idx: number; tag: string; version: string; when: number; breakpoints: boolean }[] } {
  try {
    return JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

function writeJournal(entry: { idx: number; tag: string; version: string; when: number; breakpoints: boolean }): void {
  const journal = readJournal();
  if (!journal.entries.some((e) => e.tag === entry.tag)) {
    journal.entries.push(entry);
    writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2) + "\n");
  }
}

function fix(db: Database.Database): void {
  const acExists = tableExists(db, "application_categories");
  const acType = acExists ? columnType(db, "application_categories", "id") : null;

  if (acExists && acType === "INTEGER") {
    console.log("[Fix] La BD ya está en sync. No se requiere ninguna acción.");
    return;
  }

  if (acExists && acType === "TEXT") {
    console.log("[Fix] Detectada PK text → integer. Aplicando migración 0002...");
    const sql = readFileSync(resolve("drizzle/0002_yielding_fantastic_four.sql"), "utf-8");
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(sql);
    db.exec("PRAGMA foreign_keys = ON;");
    writeJournal({ idx: 2, tag: "0002_yielding_fantastic_four", version: "6", when: Date.now(), breakpoints: true });
    console.log("[Fix] Migración 0002 aplicada. Journal actualizado.");
    return;
  }

  if (!acExists) {
    console.log("[Fix] La tabla application_categories no existe. Aplicando migraciones desde 0...");
    const journal = readJournal();
    const applied = appliedMigrations(journal);

    db.exec("PRAGMA foreign_keys = OFF;");

    for (const tag of MIGRATIONS) {
      if (!applied.has(tag)) {
        console.log(`[Fix]  → Aplicando ${tag}...`);
        const sql = readFileSync(resolve(`drizzle/${tag}.sql`), "utf-8");
        db.exec(sql);
        writeJournal({ idx: parseInt(tag.slice(0, 4)), tag, version: "6", when: Date.now(), breakpoints: true });
        console.log(`[Fix]     ${tag} aplicada. Journal actualizado.`);
      } else {
        console.log(`[Fix]  → ${tag} ya estaba aplicada, se omite.`);
      }
    }

    db.exec("PRAGMA foreign_keys = ON;");
    console.log("[Fix] Migraciones completadas.");
    return;
  }

  console.error("[Fix] Estado no esperado de la BD. Revisar manualmente.");
}

function run(): void {
  try {
    readFileSync(DB_PATH);
  } catch {
    console.error("[Fix] No se encuentra database/mda.db");
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  fix(db);
  db.close();
}

run();
