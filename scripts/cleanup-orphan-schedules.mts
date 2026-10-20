/**
 * cleanup-orphan-schedules — script ONE-TIME idempotente que borra filas
 * historicas de `schedules` cuyo agente ya no participa del cronograma.
 *
 * Contexto (issue #262): quedaron schedules de agentes fuera de cronograma o
 * con usuario inactivo. Criterio de fila huerfana:
 *
 *   schedules.agent_id no existe en agents
 *   O agents.en_cronograma <> 1
 *   O el usuario vinculado existe y users.active = 0
 *
 * Un agente sin usuario vinculado (LEFT JOIN -> NULL) se considera activo:
 * solo se exige `en_cronograma = 1`. Vinculo agents<->users case-insensitive
 * por username, mismo criterio que normalize-participaciones/backfill-asistencia.
 *
 * Seguridad:
 *   - DRY-RUN por defecto: NO escribe. Abre la DB en readonly.
 *   - `--apply` hace backup WAL-safe con `db.backup()` y borra en transaccion
 *     SINCRONA (better-sqlite3 rechaza promesas).
 *   - Solo borra filas de `schedules`. Nunca toca agents, users,
 *     saturday_rotation_config ni agent_saturday_groups.
 *   - Idempotente: una segunda corrida no encuentra filas.
 *   - Aborta si falta una tabla/columna requerida.
 *
 * Uso:
 *   npx tsx scripts/cleanup-orphan-schedules.mts               # dry-run
 *   npx tsx scripts/cleanup-orphan-schedules.mts --apply       # escribe
 *   npx tsx scripts/cleanup-orphan-schedules.mts --db <ruta>   # otra DB
 */
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { pathToFileURL } from "url";

export type OrphanScheduleRow = {
  id: number;
  agentId: number | null;
  date: string;
  agentName: string | null;
  agentUsername: string | null;
  enCronograma: number | null;
  userName: string | null;
  userActive: number | null;
};

export type OrphanAgentSummary = {
  agentId: number | null;
  agentName: string | null;
  agentUsername: string | null;
  enCronograma: number | null;
  userActive: number | null;
  rows: number;
};

export type CleanupReport = {
  dbPath: string;
  dryRun: boolean;
  evaluated: number;
  affectedRows: number;
  affectedMonths: string[];
  affectedAgents: OrphanAgentSummary[];
  deleted: number;
  backupPath: string | null;
};

const REQUIRED = {
  schedules: ["id", "agent_id", "date"],
  agents: ["id", "en_cronograma", "username", "name"],
  users: ["username", "active"],
} as const;

const SELECT_ORPHANS = `
  SELECT
    s.id AS id,
    s.agent_id AS agentId,
    s.date AS date,
    a.name AS agentName,
    a.username AS agentUsername,
    a.en_cronograma AS enCronograma,
    u.username AS userName,
    u.active AS userActive
  FROM schedules s
  LEFT JOIN agents a ON a.id = s.agent_id
  LEFT JOIN users u ON lower(coalesce(a.username, '')) = lower(u.username)
  WHERE a.id IS NULL
     OR coalesce(a.en_cronograma, 0) <> 1
     OR u.active = 0
  ORDER BY s.date, s.id
`;

const SELECT_SCHEDULE_COUNT = `SELECT COUNT(*) AS c FROM schedules`;
const DELETE_SCHEDULE = `DELETE FROM schedules WHERE id = ?`;

function backupNameFor(dbFile: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const stem = dbFile.replace(/\.db$/i, "");
  return `${stem}.bak-cleanup-orphan-schedules-${stamp}.db`;
}

function assertSchema(db: Database.Database): void {
  for (const [table, cols] of Object.entries(REQUIRED)) {
    const exists = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table);
    if (!exists) {
      throw new Error(`Falta la tabla "${table}". Abortado, sin cambios.`);
    }
    const present = new Set(
      (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
    );
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length > 0) {
      throw new Error(
        `Falta la columna "${table}.${missing[0]}". Corré npx tsx scripts/align-db-to-schema.mts. Abortado, sin cambios.`,
      );
    }
  }
}

function summarize(rows: OrphanScheduleRow[]): {
  months: string[];
  agents: OrphanAgentSummary[];
} {
  const months = new Set<string>();
  const agents = new Map<string, OrphanAgentSummary>();
  for (const r of rows) {
    months.add((r.date ?? "").slice(0, 7));
    const key = r.agentId == null ? "null" : String(r.agentId);
    const current = agents.get(key);
    if (current) {
      current.rows += 1;
    } else {
      agents.set(key, {
        agentId: r.agentId,
        agentName: r.agentName,
        agentUsername: r.agentUsername,
        enCronograma: r.enCronograma,
        userActive: r.userActive,
        rows: 1,
      });
    }
  }
  return {
    months: [...months].sort(),
    agents: [...agents.values()].sort((a, b) => b.rows - a.rows),
  };
}

export type BackupFn = (
  db: Database.Database,
  dest: string,
) => Promise<unknown>;

async function defaultBackup(db: Database.Database, dest: string): Promise<void> {
  await db.backup(dest);
}

export async function runCleanup(opts: {
  dbPath: string;
  apply?: boolean;
  backupFn?: BackupFn;
}): Promise<CleanupReport> {
  const dbPath = resolve(opts.dbPath);
  const apply = opts.apply === true;
  if (!existsSync(dbPath)) {
    throw new Error(`No existe la DB: ${dbPath}`);
  }

  const db = apply ? new Database(dbPath) : new Database(dbPath, { readonly: true });
  try {
    assertSchema(db);

    const evaluated = (
      db.prepare(SELECT_SCHEDULE_COUNT).get() as { c: number }
    ).c;
    const rows = db.prepare(SELECT_ORPHANS).all() as OrphanScheduleRow[];
    const { months, agents } = summarize(rows);

    let deleted = 0;
    let backupPath: string | null = null;

    if (apply && rows.length > 0) {
      backupPath = join(dirname(dbPath), backupNameFor(basename(dbPath)));
      try {
        await (opts.backupFn ?? defaultBackup)(db, backupPath);
      } catch (e) {
        throw new Error(
          `No se pudo crear el backup en ${backupPath}: ${(e as Error).message}. Abortado, sin cambios.`,
        );
      }

      const stmt = db.prepare(DELETE_SCHEDULE);
      const ids = rows.map((r) => r.id);
      const tx = db.transaction((items: number[]) => {
        for (const id of items) stmt.run(id);
      });
      tx(ids);
      deleted = ids.length;
    }

    return {
      dbPath,
      dryRun: !apply,
      evaluated,
      affectedRows: rows.length,
      affectedMonths: months,
      affectedAgents: agents,
      deleted,
      backupPath,
    };
  } finally {
    db.close();
  }
}

function printReport(report: CleanupReport): void {
  console.log(
    `cleanup-orphan-schedules — ${report.dryRun ? "DRY-RUN (no escribe)" : "APPLY"}`,
  );
  console.log(`DB: ${report.dbPath}`);
  console.log("");

  if (report.affectedRows === 0) {
    console.log("Sin schedules huerfanos: nada que borrar.");
  } else {
    console.log(`Filas huerfanas: ${report.affectedRows}`);
    console.log(`Meses afectados (${report.affectedMonths.length}):`);
    for (const m of report.affectedMonths) console.log(`  - ${m}`);
    console.log(`Agentes afectados (${report.affectedAgents.length}):`);
    for (const a of report.affectedAgents) {
      console.log(
        `  - ${a.agentName ?? "(agente inexistente)"} [id=${a.agentId ?? "-"}, username=${a.agentUsername ?? "-"}, cronograma=${a.enCronograma ?? "-"}, userActive=${a.userActive ?? "sin user"}] ${a.rows} filas`,
      );
    }
  }

  console.log("");
  console.log(`Evaluados    : ${report.evaluated}`);
  console.log(`Afectados    : ${report.affectedRows}`);
  console.log(
    `Borrados     : ${report.dryRun ? "dry-run (0 escritos)" : report.deleted}`,
  );
  console.log(
    `Backup       : ${report.backupPath ?? (report.dryRun ? "(dry-run, no se crea)" : "(sin cambios, no se crea)")}`,
  );
  if (report.dryRun && report.affectedRows > 0) {
    console.log("");
    console.log("Ejecutá con --apply para borrar las filas.");
  }
}

function parseArgs(argv: string[]): { dbPath: string; apply: boolean } {
  const apply = argv.includes("--apply");
  const dbIdx = argv.findIndex((a) => a === "--db");
  const positional = argv.find((a) => !a.startsWith("--"));
  const dbPath =
    dbIdx >= 0 && argv[dbIdx + 1] ? argv[dbIdx + 1] : positional ?? "./database/mda.db";
  return { dbPath, apply };
}

async function main(): Promise<void> {
  const { dbPath, apply } = parseArgs(process.argv.slice(2));
  try {
    const report = await runCleanup({ dbPath, apply });
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
