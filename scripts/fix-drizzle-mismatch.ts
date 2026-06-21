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

// Tables that migration 0002 changed from text PK to integer PK
const TEXT_TO_INT_TABLES = [
  { table: "application_categories", expectTable: true },
  { table: "contact_categories", expectTable: true },
  { table: "resource_categories", expectTable: true },
  { table: "resource_links", expectTable: true },
];

// Columns that changed from text FK to integer FK
const TEXT_TO_INT_FK = [
  { table: "applications", column: "category_id" },
  { table: "provider_contacts", column: "category_id" },
];

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columnType(db: Database.Database, table: string, col: string): string | null {
  const row = db.prepare("SELECT type FROM pragma_table_info(?) WHERE name=?").get(table, col) as { type: string } | undefined;
  return row?.type ?? null;
}

function cleanupResidualTables(db: Database.Database): void {
  const residualTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')"
  ).all("\\_map\\_%", "\\_\\_new\\_%") as { name: string }[];
  for (const { name } of residualTables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
    console.log(`[Fix]  → Tabla residual "${name}" eliminada.`);
  }

  const ftsTriggers = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE ? ESCAPE '\\'"
  ).all("\\%\\_fts\\_%") as { name: string }[];
  for (const { name } of ftsTriggers) {
    db.exec(`DROP TRIGGER IF EXISTS "${name}"`);
    console.log(`[Fix]  → Trigger FTS "${name}" eliminado.`);
  }

  const ftsTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ? ESCAPE '\\'"
  ).all("\\%\\_fts") as { name: string }[];
  for (const { name } of ftsTables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
    console.log(`[Fix]  → Tabla FTS "${name}" eliminada.`);
  }
}

function ensurePreMigrationState(db: Database.Database): void {
  // If application_categories exists with INTEGER PK (from failed drizzle-kit push),
  // we need to drop it and recreate with TEXT PK so migration 0002 can run properly.
  const ac = db.prepare("SELECT type FROM pragma_table_info('application_categories') WHERE name='id'").get() as { type: string } | undefined;
  if (!ac) {
    console.log("[Fix]  → Creando application_categories (TEXT) para permitir migración 0002...");
    db.exec("CREATE TABLE application_categories (id text PRIMARY KEY NOT NULL, title text NOT NULL);");
  } else if (ac.type === "INTEGER") {
    console.log("[Fix]  → Recreando application_categories como TEXT (pre-migración)...");
    db.exec("DROP TABLE application_categories;");
    db.exec("CREATE TABLE application_categories (id text PRIMARY KEY NOT NULL, title text NOT NULL);");
  }
}

function needsMigration001(db: Database.Database): boolean {
  const row = db.prepare("SELECT 1 FROM pragma_table_info('applications') WHERE name='sortOrder'").get();
  return !row;
}

function applyPendingMigrations(db: Database.Database): void {
  cleanupResidualTables(db);
  ensurePreMigrationState(db);

  // Migration 0001: needed if sortOrder doesn't exist on applications
  if (needsMigration001(db)) {
    console.log("[Fix]  → Aplicando migración 0001 (sortOrder, color)...");
    db.exec(readFileSync(resolve("drizzle/0001_exotic_roxanne_simpson.sql"), "utf-8"));
    writeJournalEntry({ idx: 1, tag: "0001_exotic_roxanne_simpson" });
    console.log("[Fix]     Migración 0001 aplicada.");
  }

  // Migration 0002: needed if contact_categories.id is still TEXT
  const ccType = columnType(db, "contact_categories", "id");
  if (ccType !== "INTEGER") {
    console.log("[Fix]  → Aplicando migración 0002 (text→integer PKs)...");
    db.exec(readFileSync(resolve("drizzle/0002_yielding_fantastic_four.sql"), "utf-8"));
    writeJournalEntry({ idx: 2, tag: "0002_yielding_fantastic_four" });
    console.log("[Fix]     Migración 0002 aplicada.");
  }
}

function writeJournalEntry(entry: { idx: number; tag: string }): void {
  const raw = readFileSync(JOURNAL_PATH, "utf-8");
  const journal = JSON.parse(raw);
  if (!journal.entries.some((e: { tag: string }) => e.tag === entry.tag)) {
    journal.entries.push({ ...entry, version: "6", when: Date.now(), breakpoints: true });
    writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2) + "\n");
  }
}

function run(): void {
  try { readFileSync(DB_PATH); }
  catch { console.error("[Fix] No se encuentra database/mda.db"); process.exit(1); }

  const db = new Database(DB_PATH);
  const issues: string[] = [];

  // 1. Check all TEXT→INTEGER tables
  for (const { table } of TEXT_TO_INT_TABLES) {
    if (!tableExists(db, table)) {
      issues.push(`${table}: no existe`);
    } else {
      const t = columnType(db, table, "id");
      if (t === "TEXT") issues.push(`${table}.id es TEXT, debería ser INTEGER`);
    }
  }

  // 2. Check all TEXT→INTEGER foreign keys
  for (const { table, column } of TEXT_TO_INT_FK) {
    if (tableExists(db, table)) {
      const t = columnType(db, table, column);
      if (t === "TEXT") issues.push(`${table}.${column} es TEXT, debería ser INTEGER`);
    }
  }

  db.close();

  if (issues.length === 0) {
    console.log("[Fix] No se detectan mismatches en ninguna tabla. La BD ya está en sync.");
    console.log("[Fix] Si drizzle-kit push sigue fallando, podés recrear la BD desde 0 con:");
    console.log("[Fix]   npx tsx scripts/fix-drizzle-mismatch.ts --force");
    return;
  }

  console.log(`[Fix] Se detectaron ${issues.length} problema(s):`);
  for (const issue of issues) console.log(`       - ${issue}`);
  console.log("[Fix] Aplicando migraciones pendientes para corregirlos...");

  const dbFix = new Database(DB_PATH);
  dbFix.exec("PRAGMA foreign_keys = OFF;");
  applyPendingMigrations(dbFix);
  dbFix.exec("PRAGMA foreign_keys = ON;");
  dbFix.close();

  // Verify
  const verify = new Database(DB_PATH);
  let remaining = 0;
  for (const { table } of TEXT_TO_INT_TABLES) {
    if (tableExists(verify, table) && columnType(verify, table, "id") === "TEXT") remaining++;
  }
  for (const { table, column } of TEXT_TO_INT_FK) {
    if (tableExists(verify, table) && columnType(verify, table, column) === "TEXT") remaining++;
  }
  verify.close();

  if (remaining > 0) {
    console.error(`[Fix] Quedan ${remaining} mismatch(es) sin resolver.`);
    process.exit(1);
  }

  console.log("[Fix] Todo corregido. Ya podés ejecutar npx drizzle-kit push.");
}

// --- FORCE MODE: recreate full database ---
if (process.argv.includes("--force")) {
  console.log("[Fix] Modo --force: aplicando las 3 migraciones desde 0...");
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"));
  const applied = new Set(journal.entries.map((e: { tag: string }) => e.tag));

  const db = new Database(DB_PATH);
  db.exec("PRAGMA foreign_keys = OFF;");

  for (const tag of MIGRATIONS) {
    if (!applied.has(tag)) {
      console.log(`[Fix]  → Aplicando ${tag}...`);
      db.exec(readFileSync(resolve(`drizzle/${tag}.sql`), "utf-8"));
      writeJournalEntry({ idx: parseInt(tag.slice(0, 4)), tag });
      console.log(`[Fix]     ${tag} aplicada.`);
    } else {
      console.log(`[Fix]  → ${tag} ya estaba aplicada, se omite.`);
    }
  }

  db.exec("PRAGMA foreign_keys = ON;");
  db.close();
  console.log("[Fix] Migraciones completadas.");
  process.exit(0);
}

run();
