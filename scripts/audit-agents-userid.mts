// scripts/audit-agents-userid.mts
// Auditoría read-only de la migración Plan B (agents.username -> agents.user_id).
// Gates: vinculos pendientes, user_id duplicados, foreign_key_check.
// Snapshot de conteos por tabla (incluye columnas agent_id) para comparar
// antes/despues del align que dropea la columna.
//
// Uso:
//   npx tsx scripts/audit-agents-userid.mts                  (reporte + gates)
//   npx tsx scripts/audit-agents-userid.mts --save           (guarda baseline)
//   npx tsx scripts/audit-agents-userid.mts --check          (compara vs baseline)
//   npx tsx scripts/audit-agents-userid.mts --db path.db     (otra DB)
import Database from "better-sqlite3";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const getArg = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const dbPath = getArg("--db", "database/mda.db");
const doSave = args.includes("--save");
const doCheck = args.includes("--check");
const baselinePath = `${dbPath}.audit-baseline.json`;

if (!existsSync(dbPath)) {
  console.error(`No existe la DB: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const tableCols = (table: string) =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name);
const scalar = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

const errors: string[] = [];
const counts: Record<string, number> = {};

if (!tableCols("agents").includes("user_id")) {
  console.error("ERROR: agents.user_id no existe. Correr Plan A (bootstrap) antes.");
  process.exit(1);
}

// Conteos: toda tabla con columna agent_id reporta total y agent_id NULL.
const tables = (db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
  .all() as { name: string }[])
  .map((t) => t.name)
  .sort();
for (const table of tables) {
  const cols = tableCols(table);
  counts[`${table}.total`] = scalar(`SELECT COUNT(*) c FROM "${table}"`);
  if (cols.includes("agent_id")) {
    counts[`${table}.agent_id_null`] = scalar(
      `SELECT COUNT(*) c FROM "${table}" WHERE agent_id IS NULL`,
    );
  }
}

// Gate 1 (solo pre-drop): ningun agente con username pendiente de vincular.
const hasUsername = tableCols("agents").includes("username");
if (hasUsername) {
  const pending = scalar(
    `SELECT COUNT(*) c FROM agents WHERE username IS NOT NULL AND user_id IS NULL`,
  );
  counts["agents.username_pendiente"] = pending;
  if (pending > 0) {
    errors.push(
      `${pending} agents con username y user_id NULL. Vincular (bootstrap fase 2) antes de dropear la columna.`,
    );
  }
}

// Gate 2: user_id duplicado (el UNIQUE del schema debe garantizarlo).
const dup = scalar(
  `SELECT COUNT(*) c FROM (SELECT user_id FROM agents WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) > 1)`,
);
if (dup > 0) errors.push(`${dup} user_id duplicados en agents.`);

// Gate 3: integridad referencial.
const fk = db.prepare(`PRAGMA foreign_key_check`).all();
if (fk.length > 0) errors.push(`${fk.length} violaciones de foreign_key_check.`);

// Comparacion vs baseline (post-align): ningun conteo puede bajar.
if (doCheck) {
  if (!existsSync(baselinePath)) {
    errors.push(`No existe baseline en ${baselinePath}. Correr --save ANTES del align.`);
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, number>;
    for (const [key, value] of Object.entries(counts)) {
      if (baseline[key] !== undefined && baseline[key] > value) {
        errors.push(`PELIGRO perdida de datos: ${key} paso de ${baseline[key]} a ${value}.`);
      }
    }
    for (const key of Object.keys(baseline)) {
      if (key === "agents.username_pendiente" && !hasUsername) continue;
      if (!(key in counts)) {
        errors.push(`PELIGRO clave desaparecida: ${key} existe en baseline pero no en conteos actuales.`);
      }
    }
  }
}

if (doSave) {
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2));
  console.log(`Baseline guardado: ${baselinePath}`);
}

console.log(`\nConteos (${dbPath}):`);
for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
if (!hasUsername) console.log(`  agents.username_pendiente: n/a (columna dropeada)`);

if (errors.length > 0) {
  console.error(`\nAUDIT FAIL (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nAUDIT OK");
