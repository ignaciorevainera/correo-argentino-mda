/**
 * seed-assignable-mesas — one-time idempotente: habilita como asignables las
 * mesas actualmente permitidas en el select de alta/edicion de usuario.
 *
 * Contexto: `mesas.assignable` (default false) cura que mesas pueden elegirse
 * en el select de mesa de ayuda. La migracion deja todo en false; este script
 * marca `true` las mesas de `ALLOWED_HELPDESK_NAMES` para no cambiar el
 * comportamiento actual. El admin luego cura el resto desde
 * /admin/usuarios/mesas-de-ayuda.
 *
 * La mesa principal MDA TI es ademas exenta por codigo (siempre asignable).
 *
 * Seguridad: dry-run por defecto, `--apply` con backup WAL-safe, transaccion
 * sincrona, idempotente, nunca borra filas.
 *
 * Uso:
 *   npx tsx scripts/seed-assignable-mesas.mts            # dry-run
 *   npx tsx scripts/seed-assignable-mesas.mts --apply
 *   npx tsx scripts/seed-assignable-mesas.mts --db <ruta>
 */
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { ALLOWED_HELPDESK_NAMES } from "../src/lib/helpdeskAccess";

export type SeedReport = {
  candidates: string[];
  updated: number;
  missing: string[];
  backupPath: string | null;
};

export async function runSeedAssignableMesas(options: {
  dbPath: string;
  apply: boolean;
}): Promise<SeedReport> {
  const { dbPath, apply } = options;
  if (!existsSync(dbPath)) throw new Error(`No existe la DB: ${dbPath}`);

  const db = new Database(dbPath);
  try {
    const hasColumn = (
      db.prepare('PRAGMA table_info("mesas")').all() as Array<{ name: string }>
    ).some((c) => c.name === "assignable");
    if (!hasColumn) {
      throw new Error(
        'La tabla mesas no tiene la columna "assignable": corré align-db-to-schema.mts primero.',
      );
    }

    const report: SeedReport = {
      candidates: [...ALLOWED_HELPDESK_NAMES],
      updated: 0,
      missing: [],
      backupPath: null,
    };

    const selectMesa = db.prepare(
      "SELECT id, name, assignable FROM mesas WHERE name = ?",
    );
    const toUpdate: number[] = [];
    for (const name of ALLOWED_HELPDESK_NAMES) {
      const row = selectMesa.get(name) as
        | { id: number; name: string; assignable: number }
        | undefined;
      if (!row) {
        report.missing.push(name);
        continue;
      }
      if (!row.assignable) toUpdate.push(row.id);
    }
    report.updated = toUpdate.length;

    if (!apply || toUpdate.length === 0) return report;

    const backupPath = join(
      dirname(dbPath),
      `${basename(dbPath, ".db")}.bak-seed-assignable-${Date.now()}.db`,
    );
    await db.backup(backupPath);
    report.backupPath = backupPath;

    const tx = db.transaction(() => {
      const upd = db.prepare("UPDATE mesas SET assignable = 1 WHERE id = ?");
      for (const id of toUpdate) upd.run(id);
    });
    tx();

    return report;
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dbFlag = args.indexOf("--db");
  const dbPath =
    dbFlag !== -1 && args[dbFlag + 1]
      ? args[dbFlag + 1]
      : join(process.cwd(), "database", "mda.db");

  const report = await runSeedAssignableMesas({ dbPath, apply });
  console.log(`\nseed-assignable-mesas — ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`DB: ${dbPath}`);
  console.log(`mesas a habilitar : ${report.candidates.join(", ")}`);
  console.log(`actualizadas      : ${report.updated}`);
  if (report.missing.length > 0) {
    console.log(`no encontradas    : ${report.missing.join(", ")}`);
  }
  console.log(`backup            : ${report.backupPath ?? "(dry-run, no se crea)"}`);
  if (!apply) console.log("\nUsá --apply para escribir (crea backup WAL-safe).");
}

const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("scripts/seed-assignable-mesas.mts");
if (isDirectRun) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
