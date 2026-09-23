/**
 * normalize-participaciones — script ONE-TIME idempotente que corrige datos
 * historicos de participaciones en `agents` que violan la politica vigente
 * (mesa no participativa o rol supervisor).
 *
 * Contexto: `scripts/backfill-participaciones.cjs` puso los 4 flags en true a
 * TODOS los agentes. La politica posterior (create / update-participaciones /
 * change-role en src/pages/admin/usuarios.astro) exige:
 *   - mesa no participativa (PARTICIPATION_HELPDESK_NAMES) o sin mesa -> 4 false
 *   - rol supervisor -> enCronograma false
 *
 * Seguridad:
 *   - DRY-RUN por defecto: NO escribe. Abre la DB en readonly (no toca -wal/-shm).
 *   - `--apply` escribe en transaccion SINCRONA (better-sqlite3 rechaza
 *     promesas en transaction()).
 *   - Antes de escribir hace backup WAL-safe con `db.backup()` (copia tambien
 *     el contenido pendiente en -wal; `copyFileSync` solo copiaria el .db y
 *     dejaria un backup inconsistente). Si falla, aborta ANTES de cualquier UPDATE.
 *   - Solo toca filas de `agents` cuyos flags cambian. Nunca borra filas.
 *
 * Mesa canonica: join `users.helpdesk_id = mesas.invgate_id` -> `mesas.name`.
 * NO se usa `users.helpdesk_name` (denormalizado, puede estar stale).
 * Vinculo users<->agents: `agents.user_id = users.id` (Plan B; sobrevive al
 * drop de `agents.username`).
 *
 * Uso:
 *   npx tsx scripts/normalize-participaciones.mts               # dry-run
 *   npx tsx scripts/normalize-participaciones.mts --apply       # escribe
 *   npx tsx scripts/normalize-participaciones.mts --db <ruta>   # otra DB
 */
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { pathToFileURL } from "url";
import {
  flagsEqual,
  normalizeFlags,
  type ParticipationFlags,
} from "./lib/normalizeParticipaciones.mts";

export type NormalizeChange = {
  name: string | null;
  mesaName: string | null;
  role: string;
  before: ParticipationFlags;
  after: ParticipationFlags;
};

export type NormalizeReport = {
  dbPath: string;
  dryRun: boolean;
  evaluated: number;
  affected: number;
  updated: number;
  skippedNoAgent: number;
  backupPath: string | null;
  changes: NormalizeChange[];
};

type AgentRow = {
  userId: number;
  name: string | null;
  role: string;
  mesaName: string | null;
  agentId: number | null;
  en_cronograma: number | null;
  asignable_cubic: number | null;
  incluido_calidad: number | null;
  asignable_ags: number | null;
};

const SELECT_ROWS = `
  SELECT
    u.id AS userId,
    u.role AS role,
    m.name AS mesaName,
    a.name AS name,
    a.id AS agentId,
    a.en_cronograma AS en_cronograma,
    a.asignable_cubic AS asignable_cubic,
    a.incluido_calidad AS incluido_calidad,
    a.asignable_ags AS asignable_ags
  FROM users u
  LEFT JOIN mesas m ON m.invgate_id = u.helpdesk_id
  LEFT JOIN agents a ON a.user_id = u.id
`;

const COUNT_USERS_WITHOUT_AGENT = `
  SELECT COUNT(*) AS c
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM agents a WHERE a.user_id = u.id
  )
`;

const UPDATE_AGENT = `
  UPDATE agents
  SET en_cronograma = ?, asignable_cubic = ?, incluido_calidad = ?, asignable_ags = ?
  WHERE id = ?
`;

function backupNameFor(dbFile: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const stem = dbFile.replace(/\.db$/i, "");
  return `${stem}.bak-normalize-participaciones-${stamp}.db`;
}

function rowFlags(r: AgentRow): ParticipationFlags {
  return {
    enCronograma: !!r.en_cronograma,
    asignableCubic: !!r.asignable_cubic,
    incluidoCalidad: !!r.incluido_calidad,
    asignableAgs: !!r.asignable_ags,
  };
}

export type BackupFn = (
  db: Database.Database,
  dest: string,
) => Promise<unknown>;

/** Backup WAL-safe via better-sqlite3 (incluye el contenido pendiente en -wal). */
async function defaultBackup(db: Database.Database, dest: string): Promise<void> {
  await db.backup(dest);
}

/**
 * Evalua la politica y, si `apply` y hay cambios, los persiste en una unica
 * transaccion sincrona tras crear un backup WAL-safe. Devuelve el reporte.
 *
 * - `apply=false`: conexion readonly, sin backup, sin escrituras.
 * - `apply=true`:  backup (inyectable via `backupFn` para tests) ANTES del tx.
 */
export async function runNormalize(opts: {
  dbPath: string;
  apply?: boolean;
  backupFn?: BackupFn;
}): Promise<NormalizeReport> {
  const dbPath = resolve(opts.dbPath);
  const apply = opts.apply === true;
  if (!existsSync(dbPath)) {
    throw new Error(`No existe la DB: ${dbPath}`);
  }

  // readonly cuando dry-run: evita tocar -wal/-shm. El backup solo se hace con
  // apply=true (conexion normal), por lo que readonly nunca necesita backup.
  const db = apply ? new Database(dbPath) : new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(SELECT_ROWS).all() as AgentRow[];
    const skippedNoAgent = (
      db.prepare(COUNT_USERS_WITHOUT_AGENT).get() as { c: number }
    ).c;

    const changes: NormalizeChange[] = [];
    const pending: Array<{ agentId: number; after: ParticipationFlags }> = [];

    for (const r of rows) {
      if (r.agentId == null) continue; // user sin agent vinculado -> skip
      const before = rowFlags(r);
      const after = normalizeFlags(r.mesaName, r.role, before);
      if (!flagsEqual(before, after)) {
        changes.push({
          name: r.name,
          mesaName: r.mesaName,
          role: r.role,
          before,
          after,
        });
        pending.push({ agentId: r.agentId, after });
      }
    }

    let updated = 0;
    let backupPath: string | null = null;

    if (apply && pending.length > 0) {
      backupPath = join(dirname(dbPath), backupNameFor(basename(dbPath)));
      try {
        await (opts.backupFn ?? defaultBackup)(db, backupPath);
      } catch (e) {
        throw new Error(
          `No se pudo crear el backup en ${backupPath}: ${(e as Error).message}. Abortado, sin cambios.`,
        );
      }

      const stmt = db.prepare(UPDATE_AGENT);
      // Callback SINCRONO + .run(): better-sqlite3 no admite promesas.
      const tx = db.transaction((items: typeof pending) => {
        for (const it of items) {
          stmt.run(
            it.after.enCronograma ? 1 : 0,
            it.after.asignableCubic ? 1 : 0,
            it.after.incluidoCalidad ? 1 : 0,
            it.after.asignableAgs ? 1 : 0,
            it.agentId,
          );
        }
      });
      tx(pending);
      updated = pending.length;
    }

    return {
      dbPath,
      dryRun: !apply,
      evaluated: rows.length,
      affected: changes.length,
      updated,
      skippedNoAgent,
      backupPath,
      changes,
    };
  } finally {
    db.close();
  }
}

function fmtFlags(f: ParticipationFlags): string {
  return `cronograma=${f.enCronograma ? "si" : "no"} cubic=${f.asignableCubic ? "si" : "no"} calidad=${f.incluidoCalidad ? "si" : "no"} AGS=${f.asignableAgs ? "si" : "no"}`;
}

function printReport(report: NormalizeReport): void {
  console.log(
    `normalize-participaciones — ${report.dryRun ? "DRY-RUN (no escribe)" : "APPLY"}`,
  );
  console.log(`DB: ${report.dbPath}`);
  console.log("");

  if (report.changes.length === 0) {
    console.log("Sin participaciones stale: nada que normalizar.");
  } else {
    console.log(`Usuarios afectados (${report.changes.length}):`);
    for (const c of report.changes) {
      console.log(
        `  - ${c.name ?? "?"} [mesa=${c.mesaName ?? "sin mesa"}, rol=${c.role}]`,
      );
      console.log(`      antes : ${fmtFlags(c.before)}`);
      console.log(`      despues: ${fmtFlags(c.after)}`);
    }
  }

  console.log("");
  console.log(`Evaluados      : ${report.evaluated}`);
  console.log(`Afectados      : ${report.affected}`);
  console.log(
    `Actualizados   : ${report.dryRun ? "dry-run (0 escritos)" : report.updated}`,
  );
  console.log(
    `Sin agent vinculado (skip): ${report.skippedNoAgent}`,
  );
  console.log(
    `Backup         : ${report.backupPath ?? (report.dryRun ? "(dry-run, no se crea)" : "(sin cambios, no se crea)")}`,
  );
  if (report.dryRun && report.affected > 0) {
    console.log("");
    console.log("Ejecutá con --apply para escribir los cambios.");
  }
}

function parseArgs(argv: string[]): { dbPath: string; apply: boolean } {
  const apply = argv.includes("--apply");
  const dbIdx = argv.findIndex((a) => a === "--db");
  const positional = argv.find((a) => !a.startsWith("--"));
  const dbPath =
    dbIdx >= 0 && argv[dbIdx + 1]
      ? argv[dbIdx + 1]
      : positional ?? "./database/mda.db";
  return { dbPath, apply };
}

async function main(): Promise<void> {
  const { dbPath, apply } = parseArgs(process.argv.slice(2));
  try {
    const report = await runNormalize({ dbPath, apply });
    printReport(report);
  } catch (e) {
    console.error("ERROR:", (e as Error).message);
    process.exit(1);
  }
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

if (invokedDirectly) void main();
