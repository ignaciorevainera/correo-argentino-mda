/**
 * backfill-asistencia — script ONE-TIME idempotente que inicializa
 * `agents.en_asistencia` con la politica vigente.
 *
 * Contexto: el control de asistencia listaba TODOS los agentes (incluidas
 * mesas sin seccion de asistencia y usuarios con cronograma apagado). Ahora
 * `getAttendanceData` filtra `en_asistencia = 1`. Este script deja la DB host
 * en el estado correcto en el mismo deploy:
 *   - mesa participativa (hoy solo MDA TI) + rol no supervisor + en_cronograma
 *     -> en_asistencia = 1
 *   - usuario con mesa no participativa, supervisor o cronograma apagado
 *     -> en_asistencia = 0
 *   - agente legacy SIN usuario vinculado (roster importado con username null o
 *     sin match en users): conserva en_cronograma. No hay mesa/rol para evaluar
 *     y, por sanitizacion, solo MDA TI puede tener cronograma activo.
 *
 * Invariante: enAsistencia ⊆ enCronograma. Nunca borra filas.
 *
 * Requisito: la columna `en_asistencia` debe existir. Correr ANTES
 * `npx tsx scripts/align-db-to-schema.mts` (la crea con default 0). Si falta,
 * este script aborta sin escribir.
 *
 * Seguridad:
 *   - DRY-RUN por defecto: NO escribe. Abre la DB en readonly.
 *   - `--apply` escribe en transaccion SINCRONA (better-sqlite3 rechaza
 *     promesas) tras un backup WAL-safe con `db.backup()`.
 *
 * Mesa canonica: join `users.helpdesk_id = mesas.invgate_id` -> `mesas.name`
 * (mismo criterio que normalize-participaciones y src/pages/admin/usuarios.astro).
 * Vinculo users<->agents case-insensitive por username.
 *
 * Uso:
 *   npx tsx scripts/backfill-asistencia.mts               # dry-run
 *   npx tsx scripts/backfill-asistencia.mts --apply       # escribe
 *   npx tsx scripts/backfill-asistencia.mts --db <ruta>   # otra DB
 */
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { pathToFileURL } from "url";
import { mesaHasParticipaciones } from "../src/lib/helpdeskAccess";
import { normalizeRole } from "../src/lib/rbac";

type AgentRow = {
  agentId: number;
  username: string | null;
  userId: number | null;
  role: string | null;
  mesaName: string | null;
  en_cronograma: number;
  en_asistencia: number;
};

const SELECT_ROWS = `
  SELECT
    a.id AS agentId,
    a.username AS username,
    u.id AS userId,
    u.role AS role,
    m.name AS mesaName,
    a.en_cronograma AS en_cronograma,
    a.en_asistencia AS en_asistencia
  FROM agents a
  LEFT JOIN users u ON lower(coalesce(a.username, '')) = lower(u.username)
  LEFT JOIN mesas m ON m.invgate_id = u.helpdesk_id
`;

const UPDATE_AGENT = `UPDATE agents SET en_asistencia = ? WHERE id = ?`;

export type AsistenciaChange = {
  agentId: number;
  username: string | null;
  mesaName: string | null;
  role: string | null;
  fallback: boolean;
  before: boolean;
  after: boolean;
};

export type AsistenciaReport = {
  dbPath: string;
  dryRun: boolean;
  evaluated: number;
  affected: number;
  updated: number;
  backupPath: string | null;
  changes: AsistenciaChange[];
};

/** Politica vigente: asistencia solo para mesas participativas, no supervisor, con cronograma.
 * Sin usuario vinculado (roster legacy) no hay mesa/rol que evaluar: conserva cronograma. */
export function asistenciaFor(
  mesaName: string | null,
  role: string | null,
  enCronograma: boolean,
  hasUser = true,
): boolean {
  if (!hasUser) return enCronograma;
  if (!mesaHasParticipaciones(mesaName)) return false;
  if (role && normalizeRole(role) === "supervisor") return false;
  return enCronograma;
}

function backupNameFor(dbFile: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const stem = dbFile.replace(/\.db$/i, "");
  return `${stem}.bak-backfill-asistencia-${stamp}.db`;
}

export type BackupFn = (
  db: Database.Database,
  dest: string,
) => Promise<unknown>;

async function defaultBackup(db: Database.Database, dest: string): Promise<void> {
  await db.backup(dest);
}

export async function runBackfill(opts: {
  dbPath: string;
  apply?: boolean;
  backupFn?: BackupFn;
}): Promise<AsistenciaReport> {
  const dbPath = resolve(opts.dbPath);
  const apply = opts.apply === true;
  if (!existsSync(dbPath)) {
    throw new Error(`No existe la DB: ${dbPath}`);
  }

  const db = apply ? new Database(dbPath) : new Database(dbPath, { readonly: true });
  try {
    const cols = db.prepare(`PRAGMA table_info("agents")`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "en_asistencia")) {
      throw new Error(
        'Falta la columna "agents.en_asistencia": corré primero npx tsx scripts/align-db-to-schema.mts.',
      );
    }

    const rows = db.prepare(SELECT_ROWS).all() as AgentRow[];

    const changes: AsistenciaChange[] = [];
    const pending: Array<{ agentId: number; after: boolean }> = [];
    for (const r of rows) {
      const before = !!r.en_asistencia;
      const hasUser = r.userId != null;
      const after = asistenciaFor(r.mesaName, r.role, !!r.en_cronograma, hasUser);
      if (before !== after) {
        changes.push({
          agentId: r.agentId,
          username: r.username,
          mesaName: r.mesaName,
          role: r.role,
          fallback: !hasUser,
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
      const tx = db.transaction((items: typeof pending) => {
        for (const it of items) stmt.run(it.after ? 1 : 0, it.agentId);
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
      backupPath,
      changes,
    };
  } finally {
    db.close();
  }
}

function printReport(report: AsistenciaReport): void {
  console.log(`backfill-asistencia — ${report.dryRun ? "DRY-RUN (no escribe)" : "APPLY"}`);
  console.log(`DB: ${report.dbPath}`);
  console.log("");

  if (report.changes.length === 0) {
    console.log("Sin cambios: en_asistencia ya coincide con la politica.");
  } else {
    console.log(`Agentes afectados (${report.changes.length}):`);
    for (const c of report.changes) {
      const note = c.fallback ? " (sin usuario: conserva cronograma)" : "";
      console.log(
        `  - ${c.username ?? "(sin username)"} [mesa=${c.mesaName ?? "sin mesa"}, rol=${c.role ?? "sin rol"}] ${c.before ? "si" : "no"} -> ${c.after ? "si" : "no"}${note}`,
      );
    }
  }

  console.log("");
  console.log(`Evaluados    : ${report.evaluated}`);
  console.log(`Afectados    : ${report.affected}`);
  console.log(`Actualizados : ${report.dryRun ? "dry-run (0 escritos)" : report.updated}`);
  console.log(
    `Backup       : ${report.backupPath ?? (report.dryRun ? "(dry-run, no se crea)" : "(sin cambios, no se crea)")}`,
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
    const report = await runBackfill({ dbPath, apply });
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
