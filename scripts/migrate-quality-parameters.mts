/**
 * migrate-quality-parameters — migra los parámetros de calidad configurados
 * desde localhost (o un archivo dump JSON) hacia la base de datos de producción.
 *
 * Soporta 3 modos de uso:
 *
 * 1. Exportar dump desde local:
 *    npx tsx scripts/migrate-quality-parameters.mts --dump
 *    (Genera src/data/quality-parameters.json listo para versionar en Git)
 *
 * 2. Aplicar en producción desde el dump JSON (idempotente):
 *    npx tsx scripts/migrate-quality-parameters.mts               # Dry-run (solo muestra diferencias)
 *    npx tsx scripts/migrate-quality-parameters.mts --apply       # Aplica cambios con backup WAL-safe
 *
 * 3. Migración directa entre dos bases de datos:
 *    npx tsx scripts/migrate-quality-parameters.mts --from-db ./database/mda.db --to-db C:/Projects/correo-argentino-mda/database/mda.db [--apply]
 *
 * Invariantes de seguridad:
 *  - Dry-run por defecto si no se pasa `--apply`.
 *  - En `--apply`, crea un backup WAL-safe previo mediante `db.backup()`.
 *  - Matchea por `code` único para NO romper los IDs referenciados por `audit_scores`.
 *  - Nunca borra parámetros para preservar evaluaciones históricas; solo desactiva (`active = 0`).
 */

import "dotenv/config";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { pathToFileURL } from "url";

export interface QualityParameterRecord {
  code: string;
  name: string;
  weight: number | null;
  category: string;
  channel: string;
  section: string;
  order: number;
  active: boolean;
}

export interface QualityParametersDump {
  generatedAt: string;
  source: string;
  total: number;
  activeCount: number;
  parameters: QualityParameterRecord[];
}

const DEFAULT_DUMP_PATH = "./src/data/quality-parameters.json";
const DEFAULT_DB_PATH = "./database/mda.db";

function parseArgs() {
  const args = process.argv.slice(2);
  const isDump = args.includes("--dump") || args.includes("--export");
  const apply = args.includes("--apply");

  const fromDbIdx = args.indexOf("--from-db");
  const fromDb = fromDbIdx >= 0 && args[fromDbIdx + 1] ? resolve(args[fromDbIdx + 1]) : null;

  const toDbIdx = args.indexOf("--to-db");
  const toDb = toDbIdx >= 0 && args[toDbIdx + 1] ? resolve(args[toDbIdx + 1]) : null;

  const dbIdx = args.indexOf("--db");
  const targetDb = dbIdx >= 0 && args[dbIdx + 1] ? resolve(args[dbIdx + 1]) : (toDb || resolve(DEFAULT_DB_PATH));

  const inIdx = args.indexOf("--in");
  const inPath = inIdx >= 0 && args[inIdx + 1] ? resolve(args[inIdx + 1]) : resolve(DEFAULT_DUMP_PATH);

  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : resolve(DEFAULT_DUMP_PATH);

  return { isDump, apply, fromDb, toDb, targetDb, inPath, outPath };
}

function backupNameFor(dbFile: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const stem = dbFile.replace(/\.db$/i, "");
  return `${stem}.bak-params-${stamp}.db`;
}

/**
 * Lee los parámetros de calidad desde una base de datos SQLite.
 */
export function extractParametersFromDb(dbPath: string): QualityParameterRecord[] {
  if (!existsSync(dbPath)) {
    throw new Error(`Base de datos no encontrada: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const tableCheck = db
      .prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='audit_parameters'`)
      .get() as { count: number };

    if (!tableCheck || tableCheck.count === 0) {
      throw new Error(`La tabla "audit_parameters" no existe en la base de datos: ${dbPath}`);
    }

    const rows = db
      .prepare(
        `SELECT code, name, weight, category, channel, section, [order], active 
         FROM audit_parameters 
         ORDER BY channel, section, [order], code`
      )
      .all() as Array<{
        code: string;
        name: string;
        weight: number | null;
        category: string;
        channel: string;
        section: string;
        order: number;
        active: number;
      }>;

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      weight: r.weight !== null ? Number(r.weight) : null,
      category: r.category,
      channel: r.channel,
      section: r.section,
      order: Number(r.order),
      active: Boolean(r.active),
    }));
  } finally {
    db.close();
  }
}

/**
 * Exporta los parámetros a un archivo JSON versionable.
 */
export function dumpParameters(sourceDbPath: string, destJsonPath: string) {
  console.log(`[DUMP] Extrayendo parámetros de: ${sourceDbPath}`);
  const params = extractParametersFromDb(sourceDbPath);
  const activeCount = params.filter((p) => p.active).length;

  const payload: QualityParametersDump = {
    generatedAt: new Date().toISOString(),
    source: basename(sourceDbPath),
    total: params.length,
    activeCount,
    parameters: params,
  };

  mkdirSync(dirname(destJsonPath), { recursive: true });
  writeFileSync(destJsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`[DUMP] Exitoso -> ${destJsonPath}`);
  console.log(`       Total parámetros: ${params.length} (${activeCount} activos, ${params.length - activeCount} inactivos)`);
}

/**
 * Aplica los parámetros en la base de datos destino.
 */
export async function applyParameters(opts: {
  sourceParams: QualityParameterRecord[];
  targetDbPath: string;
  apply: boolean;
}) {
  const { sourceParams, targetDbPath, apply } = opts;

  if (!existsSync(targetDbPath)) {
    throw new Error(`Base de datos destino no existe: ${targetDbPath}`);
  }

  const db = apply ? new Database(targetDbPath) : new Database(targetDbPath, { readonly: true });

  try {
    const tableCheck = db
      .prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='audit_parameters'`)
      .get() as { count: number };

    if (!tableCheck || tableCheck.count === 0) {
      throw new Error(`La tabla "audit_parameters" no existe en la base de datos destino: ${targetDbPath}`);
    }

    const existingRows = db
      .prepare(
        `SELECT id, code, name, weight, category, channel, section, [order], active 
         FROM audit_parameters`
      )
      .all() as Array<{
        id: number;
        code: string;
        name: string;
        weight: number | null;
        category: string;
        channel: string;
        section: string;
        order: number;
        active: number;
      }>;

    const existingByCode = new Map(existingRows.map((r) => [r.code, r]));

    const toInsert: QualityParameterRecord[] = [];
    const toUpdate: Array<{
      id: number;
      code: string;
      before: Partial<QualityParameterRecord>;
      after: QualityParameterRecord;
      changes: string[];
    }> = [];
    const unchanged: string[] = [];

    const sourceCodeSet = new Set(sourceParams.map((p) => p.code));

    for (const src of sourceParams) {
      const current = existingByCode.get(src.code);
      if (!current) {
        toInsert.push(src);
      } else {
        const changes: string[] = [];
        const currentActive = Boolean(current.active);
        const currentWeight = current.weight !== null ? Number(current.weight) : null;

        if (current.name !== src.name) changes.push(`name: "${current.name}" -> "${src.name}"`);
        if (currentWeight !== src.weight) changes.push(`weight: ${currentWeight} -> ${src.weight}`);
        if (current.category !== src.category) changes.push(`category: "${current.category}" -> "${src.category}"`);
        if (current.channel !== src.channel) changes.push(`channel: "${current.channel}" -> "${src.channel}"`);
        if (current.section !== src.section) changes.push(`section: "${current.section}" -> "${src.section}"`);
        if (Number(current.order) !== src.order) changes.push(`order: ${current.order} -> ${src.order}`);
        if (currentActive !== src.active) changes.push(`active: ${currentActive} -> ${src.active}`);

        if (changes.length > 0) {
          toUpdate.push({
            id: current.id,
            code: src.code,
            before: {
              name: current.name,
              weight: currentWeight,
              category: current.category,
              channel: current.channel,
              section: current.section,
              order: current.order,
              active: currentActive,
            },
            after: src,
            changes,
          });
        } else {
          unchanged.push(src.code);
        }
      }
    }

    // Parámetros en destino que no existen en origen (desactivación segura)
    const toDeactivate: Array<{ id: number; code: string; name: string }> = [];
    for (const [code, row] of existingByCode) {
      if (!sourceCodeSet.has(code) && Boolean(row.active)) {
        toDeactivate.push({ id: row.id, code: row.code, name: row.name });
      }
    }

    console.log(`\n==================================================`);
    console.log(`REPORTE DE MIGRACIÓN: ${basename(targetDbPath)}`);
    console.log(`Modo: ${apply ? "APLICAR CAMBIOS (--apply)" : "DRY-RUN (Simulación sin escritura)"}`);
    console.log(`==================================================`);
    console.log(`  - Parámetros en origen:    ${sourceParams.length}`);
    console.log(`  - Parámetros en destino:   ${existingRows.length}`);
    console.log(`  - Sin cambios (idénticos): ${unchanged.length}`);
    console.log(`  - A insertar:              ${toInsert.length}`);
    console.log(`  - A actualizar:            ${toUpdate.length}`);
    console.log(`  - A desactivar en destino: ${toDeactivate.length}`);
    console.log(`==================================================\n`);

    if (toInsert.length > 0) {
      console.log(`--- [NUEVOS PARÁMETROS A INSERTAR (${toInsert.length})] ---`);
      for (const p of toInsert) {
        console.log(`  + [${p.channel}] [${p.section}] ${p.code} ("${p.name}") | Peso: ${p.weight} | Orden: ${p.order}`);
      }
      console.log("");
    }

    if (toUpdate.length > 0) {
      console.log(`--- [PARÁMETROS A ACTUALIZAR (${toUpdate.length})] ---`);
      for (const u of toUpdate) {
        console.log(`  * [ID ${u.id}] ${u.code}:`);
        for (const ch of u.changes) {
          console.log(`      • ${ch}`);
        }
      }
      console.log("");
    }

    if (toDeactivate.length > 0) {
      console.log(`--- [PARÁMETROS A DESACTIVAR (${toDeactivate.length})] (No existen en origen) ---`);
      for (const d of toDeactivate) {
        console.log(`  - [ID ${d.id}] ${d.code} ("${d.name}") -> active = false`);
      }
      console.log("");
    }

    if (toInsert.length === 0 && toUpdate.length === 0 && toDeactivate.length === 0) {
      console.log(`✓ La base de datos ya se encuentra 100% sincronizada con los parámetros especificados.`);
      return;
    }

    if (!apply) {
      console.log(`\n[AVISO] Esto fue un DRY-RUN. Ningún cambio fue escrito en la base de datos.`);
      console.log(`Para aplicar efectivamente estos cambios, ejecutá el comando con el flag --apply:\n`);
      console.log(`  npx tsx scripts/migrate-quality-parameters.mts --apply\n`);
      return;
    }

    // --- APLICACIÓN CON BACKUP ---
    const backupPath = resolve(dirname(targetDbPath), backupNameFor(basename(targetDbPath)));
    console.log(`[BACKUP] Generando snapshot WAL-safe en: ${backupPath}...`);
    try {
      await db.backup(backupPath);
      console.log(`[BACKUP] Backup creado exitosamente.`);
    } catch (err: any) {
      throw new Error(`Falló el backup en ${backupPath}: ${err.message}. Proceso abortado sin cambios.`);
    }

    const insertStmt = db.prepare(
      `INSERT INTO audit_parameters (code, name, weight, category, channel, section, [order], active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const updateStmt = db.prepare(
      `UPDATE audit_parameters 
       SET name = ?, weight = ?, category = ?, channel = ?, section = ?, [order] = ?, active = ?
       WHERE id = ?`
    );

    const deactivateStmt = db.prepare(
      `UPDATE audit_parameters SET active = 0 WHERE id = ?`
    );

    const syncTransaction = db.transaction(() => {
      // 1. Inserciones
      for (const item of toInsert) {
        insertStmt.run(
          item.code,
          item.name,
          item.weight,
          item.category,
          item.channel,
          item.section,
          item.order,
          item.active ? 1 : 0
        );
      }

      // 2. Actualizaciones (manteniendo ID para no romper foreign keys de audit_scores)
      for (const item of toUpdate) {
        updateStmt.run(
          item.after.name,
          item.after.weight,
          item.after.category,
          item.after.channel,
          item.after.section,
          item.after.order,
          item.after.active ? 1 : 0,
          item.id
        );
      }

      // 3. Desactivaciones
      for (const item of toDeactivate) {
        deactivateStmt.run(item.id);
      }
    });

    console.log(`[TRANSACCIÓN] Ejecutando sincronización atómica...`);
    syncTransaction();
    console.log(`✓ [ÉXITO] Migración aplicada correctamente:`);
    console.log(`    - ${toInsert.length} insertados`);
    console.log(`    - ${toUpdate.length} actualizados`);
    console.log(`    - ${toDeactivate.length} desactivados`);
    console.log(`    - Backup de resguardo: ${backupPath}\n`);
  } finally {
    db.close();
  }
}

async function main() {
  const args = parseArgs();

  // Caso 1: Exportar dump (--dump)
  if (args.isDump) {
    const srcDb = args.fromDb || resolve(DEFAULT_DB_PATH);
    dumpParameters(srcDb, args.outPath);
    return;
  }

  // Caso 2: Migración directa entre bases (--from-db)
  if (args.fromDb) {
    console.log(`[MIGRACIÓN DIRECTA] Leyendo origen desde: ${args.fromDb}`);
    const sourceParams = extractParametersFromDb(args.fromDb);
    await applyParameters({
      sourceParams,
      targetDbPath: args.targetDb,
      apply: args.apply,
    });
    return;
  }

  // Caso 3: Aplicar desde archivo JSON dump (--in o default)
  if (!existsSync(args.inPath)) {
    console.error(`[ERROR] No se encontró el archivo dump: ${args.inPath}`);
    console.error(`Si estás en localhost, primero generá el dump con:\n  npx tsx scripts/migrate-quality-parameters.mts --dump\n`);
    process.exit(1);
  }

  console.log(`[APPLY] Cargando parámetros desde dump: ${args.inPath}`);
  const payload = JSON.parse(readFileSync(args.inPath, "utf8")) as QualityParametersDump;

  if (!payload || !Array.isArray(payload.parameters)) {
    throw new Error(`El archivo ${args.inPath} no tiene un formato válido de parámetros.`);
  }

  await applyParameters({
    sourceParams: payload.parameters,
    targetDbPath: args.targetDb,
    apply: args.apply,
  });
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\n[FATAL ERROR] ${err.message}`);
    process.exit(1);
  });
}

