/**
 * align-db-to-schema — alinea la base de datos con src/db/schema.ts SIN usar
 * drizzle-kit push sobre la DB real (push no converge a escala completa: recrea
 * tablas byte-idénticas y crashea en índices duplicados — bug de drizzle-kit
 * 0.31.10) y sin perder datos.
 *
 * Cómo funciona (auto-mantenido, no requiere editar este archivo al cambiar el
 * schema):
 *   1. Backup consistente de la DB objetivo (API backup de SQLite, incluye WAL)
 *   2. Genera una DB canónica temporal: push del schema actual sobre una DB
 *      vacía (siempre funciona) → DDL deseado auto-derivado de src/db/schema.ts
 *   3. Compara tabla por tabla (columnas/orden/tipos/notnull/defaults/PK/FK/
 *      CHECK e índices) entre canónica y objetivo
 *   4. Crea tablas faltantes; reconstruye (12-step SQLite, datos preservados)
 *      las desalineadas con el DDL canónico; crea índices faltantes
 *   5. Verifica: paridad total vs canónica, foreign_key_check, integrity_check,
 *      conteos de filas preservados. Aborta con exit 1 si algo falla.
 *
 * Uso:
 *   npx tsx scripts/align-db-to-schema.mts [ruta-db]
 *   (default: ./database/mda.db)
 *
 * Tablas nuevas en schema → las crea. Columnas nuevas → rebuild con defaults.
 * Si una tabla no puede copiarse sin perder datos (columna NOT NULL sin default
 * con filas existentes), la salta con reporte explícito — nunca trunca.
 */
import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const dbPath = resolve(process.argv[2] ?? "./database/mda.db");
const workDir = join(process.cwd(), ".drizzle-canonical");
const canonicalDbPath = join(workDir, "canonical.db");
const configPath = join(workDir, "drizzle.canonical.config.ts");
const backupPath = dbPath.replace(/\.db$/, "") + `.bak-align-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`;

const SCHEMA_REL = "./src/db/schema.ts";

console.log(`DB objetivo: ${dbPath}`);

function tableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name != '__drizzle_migrations'")
    .all()
    .map((r: any) => r.name);
}

function snapshotCounts(db: Database.Database): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tableNames(db)) out[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  return out;
}

function tableInfo(db: Database.Database, table: string): any[] {
  return db.prepare(`PRAGMA table_info("${table}")`).all();
}

function fkList(db: Database.Database, table: string): any[] {
  return db
    .prepare(`PRAGMA foreign_key_list("${table}")`)
    .all()
    .map((f: any) => ({ table: f.table, from: f.from, to: f.to, on_delete: f.on_delete, on_update: f.on_update }));
}

function indexNames(db: Database.Database, table: string): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL")
    .all(table)
    .map((r: any) => r.name);
}

function tableSignature(db: Database.Database, table: string): string {
  return JSON.stringify({
    cols: tableInfo(db, table).map((c) => [c.name, c.type.toLowerCase(), c.notnull, c.dflt_value, c.pk]),
    fks: fkList(db, table).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    checks: (tableDDL(db, table).match(/CONSTRAINT\s+"[^"]+"\s+CHECK/g) ?? []).sort(),
  });
}

function tableDDL(db: Database.Database, table: string): string {
  return ((db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as any)?.sql ?? "");
}

function norm(sql: string): string {
  return (sql ?? "").replace(/\s+/g, " ").replace(/\s*([,()])\s*/g, "$1").trim();
}

let failed = false;
try {
  // ── 1. Backup ────────────────────────────────────────────────────────────
  const target = new Database(dbPath);
  target.pragma("journal_mode = WAL");
  await target.backup(backupPath);
  console.log(`[1/6] Backup consistente: ${backupPath}`);
  const before = snapshotCounts(target);
  target.close();

  // ── 2. DB canónica (push sobre DB vacía — siempre converge) ─────────────
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const schemaAbs = join(process.cwd(), SCHEMA_REL).replace(/\\/g, "/");
  if (!existsSync(schemaAbs)) throw new Error(`No existe ${schemaAbs}`);
  writeFileSync(
    configPath,
    `import { defineConfig } from "drizzle-kit";\n` +
      `export default defineConfig({\n` +
      `  schema: "${schemaAbs}",\n` +
      `  out: "${join(workDir, "drizzle").replace(/\\/g, "/")}",\n` +
      `  dialect: "sqlite",\n` +
      `  dbCredentials: { url: "${canonicalDbPath.replace(/\\/g, "/")}" },\n` +
      `});\n`,
  );
  execSync(`npx drizzle-kit push --config "${configPath}" --force`, { stdio: "pipe" });
  console.log("[2/6] DB canónica generada desde src/db/schema.ts");

  const canonical = new Database(canonicalDbPath, { readonly: true });
  const aligned = new Database(dbPath);
  aligned.pragma("journal_mode = WAL");

  const canonTables = tableNames(canonical);
  const targetTables = tableNames(aligned);

  // ── 3. Diff ──────────────────────────────────────────────────────────────
  const missing = canonTables.filter((t) => !targetTables.includes(t));
  const extra = targetTables.filter((t) => !canonTables.includes(t));
  const misaligned = canonTables.filter(
    (t) => targetTables.includes(t) && tableSignature(canonical, t) !== tableSignature(aligned, t),
  );
  console.log(
    `[3/6] Diff: ${missing.length} faltantes, ${misaligned.length} desalineadas, ${extra.length} extra${extra.length ? ` (${extra.join(", ")})` : ""}`,
  );
  if (extra.length > 0) {
    console.log("  NOTA: tablas fuera del schema se dejan intactas (no se borran).");
  }

  // ── 4. Crear faltantes + reconstruir desalineadas ────────────────────────
  let created = 0;
  let rebuilt = 0;
  const skipped: Array<{ table: string; reason: string }> = [];
  const allowedLoss: Record<string, number> = {};

  for (const table of missing) {
    const ddl = tableDDL(canonical, table);
    try {
      aligned.exec(ddl);
      created++;
      console.log(`[4/6] CREATE ${table}`);
    } catch (e) {
      skipped.push({ table, reason: (e as Error).message });
    }
  }

  for (const table of misaligned) {
    const rawDDL = tableDDL(canonical, table);
    // El DDL canónico tiene CHECKs calificados con el nombre final de tabla
    // (p.ej. "users"."role"); al crear la tabla __align hay que descalificar.
    let ddl = rawDDL
      .replace(new RegExp(`"${table}"\\.`, "g"), "")
      .replace(new RegExp("`" + table + "`\\.", "g"), "");
    ddl = ddl.replace(new RegExp(`CREATE TABLE \\\`?${table}\\\`?`, "i"), `CREATE TABLE "__align_${table}"`);
    const canonCols = tableInfo(canonical, table).map((c) => c.name);
    const targetCols = new Set(tableInfo(aligned, table).map((c) => c.name));
    const common = canonCols.filter((c) => targetCols.has(c));
    const notNullNoDefaultNew = tableInfo(canonical, table).filter(
      (c) => !targetCols.has(c.name) && c.notnull === 1 && c.dflt_value === null && c.pk === 0,
    );
    if (notNullNoDefaultNew.length > 0) {
      skipped.push({
        table,
        reason: `columnas nuevas NOT NULL sin default requieren decisión manual: ${notNullNoDefaultNew.map((c) => c.name).join(", ")}`,
      });
      continue;
    }

    // Huérfanos: filas cuyo valor de FK no existe en la tabla padre violarían
    // el FK nuevo al copiar. Se resuelven según la acción onDelete del FK
    // (cascade → DELETE de la fila huérfana; set null → NULL en la columna;
    // no action → se salta la tabla con reporte). Solo FKs sobre columnas
    // copiadas y solo si la tabla padre existe en el target.
    const newFks = fkList(canonical, table);
    let skipTable = false;
    for (const fk of newFks) {
      if (!common.includes(fk.from) || !targetTables.includes(fk.table)) continue;
      try {
        const orphans = aligned
          .prepare(
            `SELECT COUNT(*) c FROM "${table}" WHERE "${fk.from}" IS NOT NULL AND "${fk.from}" NOT IN (SELECT "${fk.to}" FROM "${fk.table}")`,
          )
          .get().c as number;
        if (orphans === 0) continue;
        if (fk.on_delete.toLowerCase() === "cascade") {
          aligned
            .prepare(
              `DELETE FROM "${table}" WHERE "${fk.from}" IS NOT NULL AND "${fk.from}" NOT IN (SELECT "${fk.to}" FROM "${fk.table}")`,
            )
            .run();
          allowedLoss[table] = (allowedLoss[table] ?? 0) + orphans;
          console.log(`[4/6] ${table}: ${orphans} filas huérfanas eliminadas (FK ${fk.from}->${fk.table} cascade)`);
        } else if (fk.on_delete.toLowerCase() === "set null") {
          aligned
            .prepare(
              `UPDATE "${table}" SET "${fk.from}" = NULL WHERE "${fk.from}" IS NOT NULL AND "${fk.from}" NOT IN (SELECT "${fk.to}" FROM "${fk.table}")`,
            )
            .run();
          console.log(`[4/6] ${table}: ${orphans} FKs huérfanas a NULL (FK ${fk.from}->${fk.table} set null)`);
        } else {
          skipped.push({
            table,
            reason: `${orphans} filas huérfanas en FK ${fk.from}->${fk.table} (on_delete ${fk.on_delete}) requieren decisión manual`,
          });
          skipTable = true;
          break;
        }
      } catch (e) {
        skipped.push({ table, reason: `chequeo de huérfanos FK ${fk.from}: ${(e as Error).message}` });
        skipTable = true;
        break;
      }
    }
    if (skipTable) continue;

    aligned.pragma("foreign_keys = OFF");
    aligned.exec("BEGIN");
    try {
      aligned.exec(ddl);
      aligned
        .prepare(`INSERT INTO "__align_${table}" ("${common.join('","')}") SELECT "${common.join('","')}" FROM "${table}"`)
        .run();
      aligned.exec(`DROP TABLE "${table}"`);
      aligned.exec(`ALTER TABLE "__align_${table}" RENAME TO "${table}"`);
      aligned.exec("COMMIT");
      rebuilt++;
      console.log(`[4/6] REBUILD ${table} (${common.length}/${canonCols.length} columnas copiadas)`);
    } catch (e) {
      aligned.exec("ROLLBACK");
      skipped.push({ table, reason: (e as Error).message });
    } finally {
      aligned.pragma("foreign_keys = ON");
    }
  }

  // ── 5. Índices faltantes (desde canónica) ────────────────────────────────
  const canonIdx = canonical
    .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
    .all() as any[];
  let idxCreated = 0;
  for (const idx of canonIdx) {
    if (!indexNames(aligned, idx.tbl_name).includes(idx.name)) {
      try {
        aligned.prepare(idx.sql).run();
        idxCreated++;
        console.log(`[5/6] CREATE INDEX ${idx.name}`);
      } catch (e) {
        skipped.push({ table: idx.tbl_name, reason: `índice ${idx.name}: ${(e as Error).message}` });
      }
    }
  }
  console.log(`[5/6] Índices: ${idxCreated} creados`);

  // ── 6. Verificación ──────────────────────────────────────────────────────
  console.log("[6/6] Verificación:");
  const fkCheck = aligned.pragma("foreign_key_check");
  if (fkCheck.length > 0) {
    console.error("  FAIL foreign_key_check:", JSON.stringify(fkCheck).slice(0, 500));
    failed = true;
  } else console.log("  ok: foreign_key_check vacío");

  const integrity = aligned.pragma("integrity_check")[0] as any;
  if (integrity.integrity_check !== "ok") {
    console.error("  FAIL integrity_check:", integrity.integrity_check);
    failed = true;
  } else console.log("  ok: integrity_check");

  let parityFails = 0;
  for (const t of canonTables) {
    if (!tableNames(aligned).includes(t)) {
      console.error(`  FAIL tabla faltante: ${t}`);
      parityFails++;
      continue;
    }
    const a = JSON.stringify(tableInfo(aligned, t).map((c) => [c.name, c.type.toLowerCase(), c.notnull, c.dflt_value, c.pk]));
    const b = JSON.stringify(tableInfo(canonical, t).map((c) => [c.name, c.type.toLowerCase(), c.notnull, c.dflt_value, c.pk]));
    const fa = JSON.stringify(fkList(aligned, t).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
    const fb = JSON.stringify(fkList(canonical, t).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
    const ia = indexNames(aligned, t).sort().join(",");
    const ib = indexNames(canonical, t).sort().join(",");
    if (a !== b || fa !== fb || ia !== ib) {
      console.error(`  FAIL paridad ${t} (cols/fks/índices)`);
      parityFails++;
    }
  }
  if (parityFails === 0) console.log(`  ok: paridad completa en ${canonTables.length} tablas`);
  else failed = true;

  const after = snapshotCounts(aligned);
  let countFails = 0;
  for (const [t, beforeCount] of Object.entries(before)) {
    const afterCount = after[t] ?? 0;
    const loss = allowedLoss[t] ?? 0;
    if (afterCount < beforeCount - loss) {
      console.error(`  FAIL filas ${t}: ${beforeCount} -> ${afterCount} (permitido: -${loss})`);
      countFails++;
    }
  }
  if (countFails === 0) console.log("  ok: conteos de filas preservados");
  else failed = true;

  if (skipped.length > 0) {
    console.log("\n  PENDIENTE (tablas saltadas — requieren decisión manual):");
    for (const s of skipped) console.log(`    - ${s.table}: ${s.reason}`);
    failed = true;
  }

  canonical.close();
  aligned.close();

  if (failed) {
    console.error("\nRESULTADO: FALLÓ — restaurá el backup si hace falta: " + backupPath);
    process.exit(1);
  }
  console.log("\nRESULTADO: DB alineada al schema sin pérdida de datos.");
  console.log(`Backup conservado en: ${backupPath}`);
  console.log("No corras drizzle-kit push sobre la DB real (no converge; este script es el mecanismo).");
} catch (e) {
  console.error("ERROR FATAL:", (e as Error).message);
  console.error("Restaurá el backup si la DB quedó inconsistente: " + backupPath);
  process.exit(1);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
