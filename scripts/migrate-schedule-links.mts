// scripts/migrate-schedule-links.mts
//
// Backfill one-time de vinculos por id:
//   agents.user_id    <- users.id  (por lower(agents.username))
//   schedules.agent_id <- agents.id (por nombre, exacto y luego case-insensitive)
// Dry-run por defecto. --apply escribe en transaccion sincrona tras backup
// WAL-safe (db.backup). Idempotente. Nunca borra filas. Reporta sin-match y
// ambiguos; no adivina.
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { dirname, join, basename } from "path";
import {
  buildNameToAgentId,
  buildUsernameToUserId,
  resolveAgentIdByName,
  resolveUserIdByUsername,
} from "../src/lib/scheduleLinks";

export type MigrateOptions = {
  dbPath: string;
  apply: boolean;
};

export type MigrateReport = {
  agentsLinked: number;
  agentsNoUser: string[];
  agentsNoUsername: string[];
  agentsDuplicateUsername: string[];
  schedulesLinked: number;
  schedulesCaseInsensitive: string[];
  schedulesMissing: string[];
  schedulesAmbiguous: string[];
  backupPath: string | null;
};

export async function runMigrateScheduleLinks(
  options: MigrateOptions,
): Promise<MigrateReport> {
  const { dbPath, apply } = options;
  if (!existsSync(dbPath)) {
    throw new Error(`No existe la DB: ${dbPath}`);
  }

  const db = new Database(dbPath);
  try {
    const users = db.prepare("SELECT id, username FROM users").all() as Array<{ id: number; username: string }>;
    const agents = db.prepare("SELECT id, name, username, user_id FROM agents").all() as Array<{ id: number; name: string; username: string | null; user_id: number | null }>;
    const schedules = db.prepare("SELECT id, agent_name, agent_id FROM schedules").all() as Array<{ id: number; agent_name: string; agent_id: number | null }>;

    const userByName = buildUsernameToUserId(users);
    const agentByName = buildNameToAgentId(agents);

    const report: MigrateReport = {
      agentsLinked: 0,
      agentsNoUser: [],
      agentsNoUsername: [],
      agentsDuplicateUsername: [],
      schedulesLinked: 0,
      schedulesCaseInsensitive: [],
      schedulesMissing: [],
      schedulesAmbiguous: [],
      backupPath: null,
    };

    // Duplicados de username normalizado entre agentes: nunca asignar userId
    // (UNIQUE(user_id) obliga a 1:1); se reportan para resolucion manual.
    const seenUsernames = new Map<string, number[]>();
    for (const agent of agents) {
      if (!agent.username) continue;
      const key = agent.username.trim().toLowerCase();
      const list = seenUsernames.get(key) ?? [];
      list.push(agent.id);
      seenUsernames.set(key, list);
    }
    const duplicateUsernameIds = new Set<number>();
    for (const [, ids] of seenUsernames) {
      if (ids.length > 1) {
        for (const id of ids) duplicateUsernameIds.add(id);
        const dup = agents.find((a) => ids.includes(a.id));
        report.agentsDuplicateUsername.push(`${dup?.name ?? "?"} (${dup?.username ?? "?"})`);
      }
    }

    const agentUpdates: Array<{ agentId: number; userId: number }> = [];
    for (const agent of agents) {
      if (!agent.username) {
        if (agent.user_id == null) report.agentsNoUsername.push(agent.name);
        continue;
      }
      if (duplicateUsernameIds.has(agent.id)) continue;
      const userId = resolveUserIdByUsername(userByName, agent.username);
      if (userId == null) {
        report.agentsNoUser.push(`${agent.name} (${agent.username})`);
        continue;
      }
      if (agent.user_id !== userId) agentUpdates.push({ agentId: agent.id, userId });
    }

    const scheduleUpdates: Array<{ scheduleId: number; agentId: number }> = [];
    for (const row of schedules) {
      const resolved = resolveAgentIdByName(agentByName, row.agent_name);
      if (resolved.match === "none") {
        report.schedulesMissing.push(row.agent_name);
        continue;
      }
      if (resolved.match === "ambiguous") {
        report.schedulesAmbiguous.push(row.agent_name);
        continue;
      }
      if (resolved.match === "case-insensitive") {
        report.schedulesCaseInsensitive.push(row.agent_name);
      }
      if (resolved.agentId != null && row.agent_id !== resolved.agentId) {
        scheduleUpdates.push({ scheduleId: row.id, agentId: resolved.agentId });
      }
    }

    report.agentsLinked = agentUpdates.length;
    report.schedulesLinked = scheduleUpdates.length;
    report.schedulesMissing = [...new Set(report.schedulesMissing)];
    report.schedulesCaseInsensitive = [...new Set(report.schedulesCaseInsensitive)];
    report.schedulesAmbiguous = [...new Set(report.schedulesAmbiguous)];

    if (!apply || (agentUpdates.length === 0 && scheduleUpdates.length === 0)) {
      return report;
    }

    const backupPath = join(
      dirname(dbPath),
      `${basename(dbPath, ".db")}.bak-migrate-links-${Date.now()}.db`,
    );
    await db.backup(backupPath);
    report.backupPath = backupPath;

    const tx = db.transaction(() => {
      const setAgentUser = db.prepare(
        "UPDATE agents SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id <> ?)",
      );
      for (const u of agentUpdates) setAgentUser.run(u.userId, u.agentId, u.userId);
      const setScheduleAgent = db.prepare(
        "UPDATE schedules SET agent_id = ? WHERE id = ? AND (agent_id IS NULL OR agent_id <> ?)",
      );
      for (const u of scheduleUpdates) setScheduleAgent.run(u.agentId, u.scheduleId, u.agentId);
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

  const report = await runMigrateScheduleLinks({ dbPath, apply });
  console.log(`\nmigrate-schedule-links — ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`DB: ${dbPath}`);
  console.log(`agents vinculados a user : ${report.agentsLinked}`);
  console.log(`agents sin username      : ${report.agentsNoUsername.length}`);
  console.log(`agents sin user          : ${report.agentsNoUser.length}`);
  console.log(`agents username duplicado: ${report.agentsDuplicateUsername.length}`);
  console.log(`schedules vinculados     : ${report.schedulesLinked}`);
  console.log(`schedules case-insensitive: ${report.schedulesCaseInsensitive.length}`);
  console.log(`schedules sin agente     : ${report.schedulesMissing.length}`);
  console.log(`schedules ambiguos       : ${report.schedulesAmbiguous.length}`);
  if (report.schedulesMissing.length > 0) {
    console.log(`  sin agente: ${report.schedulesMissing.slice(0, 10).join(", ")}${report.schedulesMissing.length > 10 ? " …" : ""}`);
  }
  if (report.schedulesAmbiguous.length > 0) {
    console.log(`  ambiguos: ${report.schedulesAmbiguous.join(", ")}`);
  }
  console.log(`backup                   : ${report.backupPath ?? "(dry-run, no se crea)"}`);
  if (!apply) console.log("\nUsá --apply para escribir (crea backup WAL-safe).");
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate-schedule-links.mts");
if (isDirectRun) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
