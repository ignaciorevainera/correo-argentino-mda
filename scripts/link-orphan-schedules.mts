// scripts/link-orphan-schedules.mts
//
// Backfill one-time de schedules huerfanos (agent_id IS NULL):
// crea agentes-shell (username/user_id NULL, flags false) para los nombres
// historicos sin fila en agents y vincula sus schedules por nombre.
// Dry-run por defecto. --apply escribe en transaccion sincrona tras backup
// WAL-safe (db.backup). Idempotente. Nunca borra filas ni agentes.
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { dirname, join, basename } from "path";
import {
  buildNameToAgentId,
  resolveAgentIdByName,
} from "../src/lib/scheduleLinks";

export type LinkOrphanOptions = {
  dbPath: string;
  apply: boolean;
};

export type LinkOrphanReport = {
  agentsCreated: number;
  agentsReused: number;
  rowsLinked: number;
  orphansUnlinkable: string[];
  backupPath: string | null;
};

type PlannedName = {
  rawName: string;
  trimmedName: string;
  targetId: number;
  create: boolean;
};

export async function runLinkOrphanSchedules(
  options: LinkOrphanOptions,
): Promise<LinkOrphanReport> {
  const { dbPath, apply } = options;
  if (!existsSync(dbPath)) {
    throw new Error(`No existe la DB: ${dbPath}`);
  }

  const db = new Database(dbPath);
  try {
    const agents = db.prepare("SELECT id, name FROM agents").all() as Array<{
      id: number;
      name: string;
    }>;
    const nameToAgentId = buildNameToAgentId(agents);
    const orphanNames = (
      db
        .prepare(
          "SELECT DISTINCT agent_name FROM schedules WHERE agent_id IS NULL AND trim(agent_name) <> ''",
        )
        .all() as Array<{ agent_name: string }>
    ).map((row) => row.agent_name);
    const emptyNameRows = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM schedules WHERE agent_id IS NULL AND trim(agent_name) = ''",
        )
        .get() as { c: number }
    ).c;

    const findByLowerName = db.prepare(
      "SELECT id, name FROM agents WHERE lower(name) = lower(?)",
    );
    const countRowsByName = db.prepare(
      "SELECT COUNT(*) AS c FROM schedules WHERE agent_id IS NULL AND agent_name = ?",
    );

    const report: LinkOrphanReport = {
      agentsCreated: 0,
      agentsReused: 0,
      rowsLinked: 0,
      orphansUnlinkable: [],
      backupPath: null,
    };

    const plan: PlannedName[] = [];
    let simulatedId = -1;

    for (const rawName of orphanNames) {
      const trimmedName = rawName.trim();
      const resolved = resolveAgentIdByName(nameToAgentId, trimmedName);

      if (resolved.match === "ambiguous") {
        report.orphansUnlinkable.push(
          `(ambiguo, sin vincular): ${rawName}`,
        );
        continue;
      }

      let targetId: number | null = resolved.agentId ?? null;
      let create = false;

      if (targetId == null) {
        const caseVariants = findByLowerName.all(trimmedName) as Array<{
          id: number;
          name: string;
        }>;
        if (caseVariants.length > 1) {
          report.orphansUnlinkable.push(
            `(ambiguo, sin vincular): ${rawName}`,
          );
          continue;
        }
        if (caseVariants.length === 1) {
          targetId = caseVariants[0].id;
          nameToAgentId.set(trimmedName, caseVariants[0].id);
        } else {
          targetId = simulatedId;
          simulatedId -= 1;
          create = true;
          nameToAgentId.set(trimmedName, targetId);
        }
      }

      if (create) {
        report.agentsCreated += 1;
      } else {
        report.agentsReused += 1;
      }

      const rowCount = (countRowsByName.get(rawName) as { c: number }).c;
      report.rowsLinked += rowCount;
      plan.push({ rawName, trimmedName, targetId, create });
    }

    if (emptyNameRows > 0) {
      report.orphansUnlinkable.push(`(nombre vacío): ${emptyNameRows} filas`);
    }

    if (!apply || plan.length === 0) {
      return report;
    }

    const backupPath = join(
      dirname(dbPath),
      `${basename(dbPath, ".db")}.bak-link-orphans-${Date.now()}.db`,
    );
    await db.backup(backupPath);
    report.backupPath = backupPath;

    const tx = db.transaction(() => {
      const insertAgent = db.prepare(
        "INSERT INTO agents (name, username, user_id, en_cronograma, asignable_cubic, incluido_calidad, asignable_ags) VALUES (?, NULL, NULL, 0, 0, 0, 0)",
      );
      const linkRows = db.prepare(
        "UPDATE schedules SET agent_id = ? WHERE agent_id IS NULL AND agent_name = ?",
      );

      const realIdBySimulated = new Map<number, number>();
      for (const item of plan) {
        if (!item.create) continue;
        const info = insertAgent.run(item.trimmedName);
        realIdBySimulated.set(item.targetId, Number(info.lastInsertRowid));
      }
      for (const item of plan) {
        const targetId = item.create
          ? realIdBySimulated.get(item.targetId)
          : item.targetId;
        if (targetId == null) continue;
        linkRows.run(targetId, item.rawName);
      }
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
  const dbFlagIndex = args.indexOf("--db");
  const dbPath =
    dbFlagIndex !== -1 && args[dbFlagIndex + 1]
      ? args[dbFlagIndex + 1]
      : join(process.cwd(), "database", "mda.db");

  const report = await runLinkOrphanSchedules({ dbPath, apply });
  console.log(`\nlink-orphan-schedules — ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`DB: ${dbPath}`);
  console.log(`agentes-shell a crear   : ${report.agentsCreated}`);
  console.log(`agentes existentes reuse: ${report.agentsReused}`);
  console.log(`schedules a vincular    : ${report.rowsLinked}`);
  console.log(`huerfanos sin vincular  : ${report.orphansUnlinkable.length}`);
  if (report.orphansUnlinkable.length > 0) {
    for (const item of report.orphansUnlinkable) {
      console.log(`  ${item}`);
    }
  }
  console.log(`backup                  : ${report.backupPath ?? "(dry-run, no se crea)"}`);
  if (!apply) console.log("\nUsá --apply para escribir (crea backup WAL-safe).");
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/link-orphan-schedules.mts");
if (isDirectRun) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
