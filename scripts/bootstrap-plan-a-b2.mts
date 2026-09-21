// scripts/bootstrap-plan-a-b2.mts
//
// Bootstrap one-shot de una DB pre-Plan-A al estado final (Plan A + B2) SIN
// perdida de datos. Resuelve el orden peligroso: la DB host nunca recibio
// Plan A (schedules.agent_id / agents.user_id ausentes, schedules.agent_name
// presente). Correr align-db-to-schema.mts directo dropearia agent_name antes
// de poder vincular los horarios.
//
// Fases (todas idempotentes, detectan su estado):
//   0. Diagnostico (nunca escribe): que columnas faltan.
//   1. Columnas Plan A: ALTER TABLE schedules ADD agent_id + indice;
//      ALTER TABLE agents ADD user_id (sin UNIQUE; lo agrega el align final).
//   2. Backfill: agents.user_id <- users.id por lower(username) unico;
//      schedules.agent_id <- agents.id por nombre (exacto -> case-insensitive).
//   3. Reconciliacion de huerfanos: nombres sin agente -> agente-shell inerte.
//   3b. Saneo hidden_helpdesks: si la tabla tiene filas cuyo invgate_id no
//       existe en mesas, se eliminan ANTES del align. align crea mesas (vacia
//       si falta) y reconstruye hidden_helpdesks con el FK nuevo; pero solo
//       chequea huerfanos de FK si la tabla padre (mesas) ya existia en el
//       snapshot previo al rebuild. Por eso garantizamos mesas + prune aca.
//   4. Align final: subproceso scripts/align-db-to-schema.mts (solo --apply).
//
// Dry-run por defecto. --apply hace backup WAL-safe y escribe en UNA
// transaccion sincrona, luego corre la Fase 4 (que tiene su propio backup).
// Nunca borra filas ni agentes (el saneo de hidden_helpdesks es la unica
// excepcion: solo elimina filas huerfanas sin padre posible).
import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join, basename } from "path";
import {
  buildNameToAgentId,
  resolveAgentIdByName,
} from "../src/lib/scheduleLinks";

export type BootstrapOptions = {
  dbPath: string;
  apply: boolean;
  skipAlign?: boolean;
};

export type BootstrapReport = {
  phases: {
    diagnostics: string;
    columns: string;
    backfill: string;
    orphans: string;
    saneo: string;
    align: string;
  };
  columnsAdded: string[];
  agentsLinked: number;
  agentsNoUser: string[];
  schedulesLinked: number;
  schedulesCaseInsensitive: string[];
  schedulesMissing: string[];
  schedulesAmbiguous: string[];
  shellsCreated: number;
  rowsLinkedToShells: number;
  hiddenHelpdesksPruned: number;
  backupPath: string | null;
  alignRan: boolean;
};

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null };

// DDL canonico de mesas (espejo de src/db/schema.ts, columna por columna).
// Se usa solo si la tabla falta al momento del saneo. Incluye los UNIQUE de
// invgate_id y name para que la tabla sea valida aun si align no corre
// (--no-align); align igual reconcilia sus indices unicos con nombre.
const MESAS_DDL = `
CREATE TABLE IF NOT EXISTS "mesas" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "invgate_id" integer NOT NULL UNIQUE,
  "name" text NOT NULL UNIQUE,
  "display_name" text,
  "active" integer DEFAULT true NOT NULL,
  "last_synced_at" text NOT NULL
);
`;

function tableInfo(db: Database.Database, table: string): ColInfo[] {
  return db.prepare(`PRAGMA table_info("${table}")`).all() as ColInfo[];
}

function tableExists(db: Database.Database, table: string): boolean {
  return (
    db
      .prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name=?")
      .get(table) as { c: number }
  ).c > 0;
}

function hasIndex(db: Database.Database, name: string): boolean {
  return (
    db
      .prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND name=?")
      .get(name) as { c: number }
  ).c > 0;
}

const normalizeKey = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

function buildShellInsertDef(db: Database.Database): {
  sql: string;
  extras: unknown[];
} {
  const info = tableInfo(db, "agents");
  const has = (n: string): boolean => info.some((c) => c.name === n);
  const cols: string[] = ["name"];
  const extras: unknown[] = [];
  const add = (n: string, v: unknown): void => {
    if (has(n) && !cols.includes(n)) {
      cols.push(n);
      extras.push(v);
    }
  };
  add("username", null);
  add("user_id", null);
  add("en_cronograma", 0);
  add("asignable_cubic", 0);
  add("incluido_calidad", 0);
  add("asignable_ags", 0);
  // Columnas NOT NULL sin default que no cubrimos: fallback sensato.
  for (const c of info) {
    if (c.name === "id" || cols.includes(c.name)) continue;
    if (c.notnull === 1 && c.dflt_value === null) {
      cols.push(c.name);
      extras.push(c.type.toUpperCase().includes("INT") ? 0 : "");
    }
  }
  const sql = `INSERT INTO agents (${cols.join(", ")}) VALUES (${cols
    .map(() => "?")
    .join(", ")})`;
  return { sql, extras };
}

export async function runBootstrap(
  options: BootstrapOptions,
): Promise<BootstrapReport> {
  const { dbPath, apply, skipAlign = false } = options;
  if (!existsSync(dbPath)) {
    throw new Error(`No existe la DB: ${dbPath}`);
  }

  const db = new Database(dbPath);
  try {
    // ── Fase 0 — diagnostico ────────────────────────────────────────────────
    const schedulesInfo = tableInfo(db, "schedules");
    const agentsInfo = tableInfo(db, "agents");
    const scheduleCols = new Set(schedulesInfo.map((c) => c.name));
    const agentCols = new Set(agentsInfo.map((c) => c.name));

    const hasAgentId = scheduleCols.has("agent_id");
    const hasAgentName = scheduleCols.has("agent_name");
    const hasUserId = agentCols.has("user_id");
    const hasAgentIdIdx = hasIndex(db, "schedules_agent_id_idx");

    // ── Fase 1 — plan de columnas ───────────────────────────────────────────
    const columnsAdded: string[] = [];
    if (!hasAgentId) {
      columnsAdded.push(
        "ALTER TABLE schedules ADD COLUMN agent_id INTEGER REFERENCES agents(id)",
      );
    }
    if (!hasAgentIdIdx) {
      columnsAdded.push(
        "CREATE INDEX IF NOT EXISTS schedules_agent_id_idx ON schedules(agent_id)",
      );
    }
    if (!hasUserId) {
      columnsAdded.push(
        "ALTER TABLE agents ADD COLUMN user_id INTEGER REFERENCES users(id)",
      );
    }

    // ── Fase 2a — backfill agents.user_id ───────────────────────────────────
    const agentSelect = hasUserId
      ? "SELECT id, name, username, user_id FROM agents"
      : "SELECT id, name, username, NULL AS user_id FROM agents";
    const agents = db.prepare(agentSelect).all() as Array<{
      id: number;
      name: string;
      username: string | null;
      user_id: number | null;
    }>;
    const users = db.prepare("SELECT id, username FROM users").all() as Array<{
      id: number;
      username: string;
    }>;

    const usersByLower = new Map<string, number[]>();
    for (const u of users) {
      const key = String(u.username ?? "").toLowerCase();
      const list = usersByLower.get(key) ?? [];
      list.push(u.id);
      usersByLower.set(key, list);
    }

    const agentsNoUser: string[] = [];
    const agentLinks: Array<{ agentId: number; userId: number }> = [];
    for (const agent of agents) {
      if (agent.user_id != null) continue; // ya vinculado (idempotente)
      const uname = String(agent.username ?? "").trim();
      if (!uname) continue; // sin username de portal: no aplica
      const candidates = usersByLower.get(uname.toLowerCase()) ?? [];
      if (candidates.length === 1) {
        agentLinks.push({ agentId: agent.id, userId: candidates[0] });
      } else if (candidates.length > 1) {
        agentsNoUser.push(`${agent.name} (${uname}) [ambiguo]`);
      } else {
        agentsNoUser.push(`${agent.name} (${uname})`);
      }
    }

    // ── Fase 2b + 3 — plan de schedules ─────────────────────────────────────
    const nameToAgentId = buildNameToAgentId(
      agents.map((a) => ({ id: a.id, name: a.name })),
    );
    const schedulePlan: Array<{ rawName: string; targetId: number }> = [];
    const schedulesCaseInsensitive: string[] = [];
    const schedulesMissing: string[] = [];
    const schedulesAmbiguous: string[] = [];
    const shellNames: Array<{ id: number; name: string; rows: number }> = [];
    const shellByKey = new Map<string, number>();
    let schedulesLinked = 0;
    let rowsLinkedToShells = 0;

    if (hasAgentName) {
      const groupSql = hasAgentId
        ? "SELECT agent_name, COUNT(*) AS c FROM schedules WHERE agent_id IS NULL GROUP BY agent_name ORDER BY agent_name"
        : "SELECT agent_name, COUNT(*) AS c FROM schedules GROUP BY agent_name ORDER BY agent_name";
      const groups = db.prepare(groupSql).all() as Array<{
        agent_name: string;
        c: number;
      }>;

      let simulated = -1;
      let emptyNameRows = 0;
      for (const group of groups) {
        const raw = String(group.agent_name);
        const trimmed = raw.trim();
        if (trimmed === "") {
          emptyNameRows += group.c;
          continue;
        }

        const resolved = resolveAgentIdByName(nameToAgentId, trimmed);
        if (resolved.match === "ambiguous") {
          schedulesAmbiguous.push(raw);
          continue;
        }
        if (resolved.match === "exact" || resolved.match === "case-insensitive") {
          schedulePlan.push({ rawName: raw, targetId: resolved.agentId! });
          schedulesLinked += group.c;
          if (resolved.match === "case-insensitive") {
            schedulesCaseInsensitive.push(`${trimmed} (${group.c} filas)`);
          }
          continue;
        }

        // Sin agente → shell (dedupe por nombre normalizado).
        const key = normalizeKey(trimmed);
        let simId = shellByKey.get(key);
        if (simId === undefined) {
          simId = simulated;
          simulated -= 1;
          shellByKey.set(key, simId);
          shellNames.push({ id: simId, name: trimmed, rows: 0 });
        }
        const shell = shellNames.find((s) => s.id === simId)!;
        shell.rows += group.c;
        rowsLinkedToShells += group.c;
        schedulesMissing.push(trimmed);
        schedulePlan.push({ rawName: raw, targetId: simId });
      }
      if (emptyNameRows > 0) {
        schedulesMissing.push(`(nombre vacío): ${emptyNameRows} filas`);
      }
    }

    // ── Fase 3b — saneo hidden_helpdesks ────────────────────────────────────
    // Filas cuyo invgate_id no existe en mesas. align reconstruye
    // hidden_helpdesks con FK -> mesas.invgate_id; si hay huerfanas el rebuild
    // falla el foreign_key_check. align solo chequea huerfanos de FK si mesas
    // YA existia en su snapshot, asi que garantizamos mesas + prune aca.
    const hiddenExists = tableExists(db, "hidden_helpdesks");
    const mesasExists = tableExists(db, "mesas");
    let hiddenOrphans = 0;
    if (hiddenExists) {
      hiddenOrphans = mesasExists
        ? (db
            .prepare(
              "SELECT COUNT(*) c FROM hidden_helpdesks WHERE invgate_id NOT IN (SELECT invgate_id FROM mesas)",
            )
            .get() as { c: number }).c
        : // mesas aun no existe: align la crea vacia -> todas las filas huerfanas.
          (db.prepare("SELECT COUNT(*) c FROM hidden_helpdesks").get() as {
            c: number;
          }).c;
    }
    const saneoWork = hiddenExists && hiddenOrphans > 0;

    const saneoPlan = !hiddenExists
      ? "sin tabla hidden_helpdesks"
      : hiddenOrphans === 0
        ? "sin huerfanas"
        : mesasExists
          ? `${hiddenOrphans} filas huerfanas (dry-run: a eliminar)`
          : `${hiddenOrphans} filas (mesas ausente: todas serian huerfanas; dry-run: a eliminar)`;

    const report: BootstrapReport = {
      phases: {
        diagnostics:
          `agent_id=${hasAgentId ? "ok" : "falta"}, user_id=${hasUserId ? "ok" : "falta"}, ` +
          `agent_name=${hasAgentName ? "presente (pre-Plan-A)" : "ausente (post-B2)"}`,
        columns: `${columnsAdded.length} cambios planificados`,
        backfill: `${agentLinks.length} agents, ${schedulesLinked} schedules`,
        orphans: `${shellNames.length} shells, ${rowsLinkedToShells} filas`,
        saneo: saneoPlan,
        align: skipAlign ? "omitido (skipAlign)" : "pendiente (fase 4)",
      },
      columnsAdded,
      agentsLinked: agentLinks.length,
      agentsNoUser,
      schedulesLinked,
      schedulesCaseInsensitive,
      schedulesMissing,
      schedulesAmbiguous,
      shellsCreated: shellNames.length,
      rowsLinkedToShells,
      hiddenHelpdesksPruned: hiddenOrphans,
      backupPath: null,
      alignRan: false,
    };

    const hasWork =
      columnsAdded.length > 0 ||
      agentLinks.length > 0 ||
      schedulePlan.length > 0;

    // ── Dry-run ─────────────────────────────────────────────────────────────
    if (!apply) {
      report.phases.align = skipAlign
        ? "omitido (skipAlign)"
        : "pendiente: correr align-db-to-schema tras --apply";
      return report;
    }

    // ── Apply ───────────────────────────────────────────────────────────────
    if (hasWork || saneoWork) {
      const backupPath = dbPath.replace(/\.db$/, "") +
        `.bak-bootstrap-${Date.now()}.db`;
      await db.backup(backupPath);
      report.backupPath = backupPath;
    }

    if (hasWork) {
      const shellInsert = buildShellInsertDef(db);
      const tx = db.transaction(() => {
        // Fase 1 — DDL.
        if (!hasAgentId) {
          db.exec(
            "ALTER TABLE schedules ADD COLUMN agent_id INTEGER REFERENCES agents(id)",
          );
        }
        if (!hasAgentIdIdx) {
          db.exec(
            "CREATE INDEX IF NOT EXISTS schedules_agent_id_idx ON schedules(agent_id)",
          );
        }
        if (!hasUserId) {
          db.exec(
            "ALTER TABLE agents ADD COLUMN user_id INTEGER REFERENCES users(id)",
          );
        }

        // Fase 2a — agents.user_id.
        const updateAgent = db.prepare(
          "UPDATE agents SET user_id = ? WHERE id = ?",
        );
        for (const link of agentLinks) {
          updateAgent.run(link.userId, link.agentId);
        }

        // Fase 3 — shells (antes de vincular).
        const insertShell = db.prepare(shellInsert.sql);
        const realIdBySimulated = new Map<number, number>();
        for (const shell of shellNames) {
          const info = insertShell.run(shell.name, ...shellInsert.extras);
          realIdBySimulated.set(shell.id, Number(info.lastInsertRowid));
        }

        // Fase 2b + 3 — schedules.agent_id. Solo si la columna origen existe
        // (post-B2 la dropea): con agent_name ausente no hay nada que vincular.
        if (hasAgentName) {
          const linkRows = db.prepare(
            "UPDATE schedules SET agent_id = ? WHERE agent_id IS NULL AND agent_name = ?",
          );
          for (const item of schedulePlan) {
            const targetId =
              item.targetId < 0
                ? realIdBySimulated.get(item.targetId)
                : item.targetId;
            if (targetId == null || targetId < 0) {
              throw new Error(
                `Id invalido al vincular "${item.rawName}" (${item.targetId})`,
              );
            }
            linkRows.run(targetId, item.rawName);
          }
        }
      });
      tx();
      report.phases.columns = `${columnsAdded.length} aplicados`;
      report.phases.backfill = `${agentLinks.length} agents, ${schedulesLinked} schedules vinculados`;
      report.phases.orphans = `${shellNames.length} shells, ${rowsLinkedToShells} filas`;
    } else {
      report.phases.columns = "sin cambios";
      report.phases.backfill = "sin cambios";
      report.phases.orphans = "sin cambios";
    }

    // ── Fase 3b — saneo (apply) ─────────────────────────────────────────────
    if (saneoWork) {
      const tx = db.transaction(() => {
        if (!mesasExists) db.exec(MESAS_DDL);
        db.prepare(
          "DELETE FROM hidden_helpdesks WHERE invgate_id NOT IN (SELECT invgate_id FROM mesas)",
        ).run();
      });
      tx();
      report.hiddenHelpdesksPruned = hiddenOrphans;
      report.phases.saneo =
        `${hiddenOrphans} filas hidden_helpdesks eliminadas` +
        (mesasExists ? "" : " (mesas creada vacia)");
    } else {
      report.hiddenHelpdesksPruned = 0;
      report.phases.saneo = !hiddenExists
        ? "sin tabla hidden_helpdesks"
        : "sin huerfanas";
    }

    // ── Fase 4 — align final ────────────────────────────────────────────────
    if (skipAlign) {
      report.phases.align = "omitido (skipAlign)";
      return report;
    }
    const cmd = `npx tsx scripts/align-db-to-schema.mts "${dbPath}"`;
    execSync(cmd, { cwd: process.cwd(), stdio: "inherit" });
    report.alignRan = true;
    report.phases.align = "ejecutado (align-db-to-schema)";
    return report;
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const skipAlign = args.includes("--no-align");
  const dbFlagIndex = args.indexOf("--db");
  const dbPath =
    dbFlagIndex !== -1 && args[dbFlagIndex + 1]
      ? args[dbFlagIndex + 1]
      : join(process.cwd(), "database", "mda.db");

  const report = await runBootstrap({ dbPath, apply, skipAlign });

  console.log(
    `\nbootstrap-plan-a-b2 — ${apply ? "APPLY" : "DRY-RUN"}`,
  );
  console.log(`DB: ${dbPath}`);
  console.log("\nFases:");
  console.log(`  0 diagnostico : ${report.phases.diagnostics}`);
  console.log(`  1 columnas    : ${report.phases.columns}`);
  console.log(`  2 backfill    : ${report.phases.backfill}`);
  console.log(`  3 huerfanos   : ${report.phases.orphans}`);
  console.log(`  saneo         : ${report.phases.saneo}`);
  console.log(`  4 align       : ${report.phases.align}`);

  if (report.columnsAdded.length > 0) {
    console.log("\nColumnas/indices planificados:");
    for (const c of report.columnsAdded) console.log(`  - ${c}`);
  }

  console.log(`\nagents vinculados       : ${report.agentsLinked}`);
  console.log(`schedules vinculados    : ${report.schedulesLinked}`);
  console.log(`shells creados          : ${report.shellsCreated}`);
  console.log(`filas -> shells         : ${report.rowsLinkedToShells}`);
  console.log(
    `hidden_helpdesks ${apply ? "saneadas" : "a sanear (dry-run)"} : ${report.hiddenHelpdesksPruned}`,
  );

  if (report.schedulesCaseInsensitive.length > 0) {
    console.log(`\nmatches case-insensitive (${report.schedulesCaseInsensitive.length}):`);
    for (const m of report.schedulesCaseInsensitive.slice(0, 20)) console.log(`  - ${m}`);
  }
  if (report.schedulesMissing.length > 0) {
    console.log(`\nsin agente / reconstruidos (${report.schedulesMissing.length}):`);
    for (const m of report.schedulesMissing.slice(0, 20)) console.log(`  - ${m}`);
    if (report.schedulesMissing.length > 20) {
      console.log(`  … y ${report.schedulesMissing.length - 20} más`);
    }
  }
  if (report.schedulesAmbiguous.length > 0) {
    console.log(`\nambiguos (${report.schedulesAmbiguous.length}):`);
    for (const m of report.schedulesAmbiguous.slice(0, 20)) console.log(`  - ${m}`);
  }
  if (report.agentsNoUser.length > 0) {
    console.log(`\nagents sin usuario (${report.agentsNoUser.length}):`);
    for (const m of report.agentsNoUser.slice(0, 20)) console.log(`  - ${m}`);
  }

  console.log(`\nbackup                  : ${report.backupPath ?? "(dry-run, no se crea)"}`);
  if (!apply) {
    console.log("\nUsá --apply para escribir (crea backup WAL-safe y corre el align).");
    console.log("Usá --no-align para omitir la fase 4.");
  } else if (!report.alignRan) {
    console.log(
      "\nFase 4 omitida: corré `npx tsx scripts/align-db-to-schema.mts " +
        `${dbPath}\` para finalizar (agrega UNIQUE a user_id y dropea agent_name).`,
    );
  }
}

const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("scripts/bootstrap-plan-a-b2.mts");
if (isDirectRun) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
