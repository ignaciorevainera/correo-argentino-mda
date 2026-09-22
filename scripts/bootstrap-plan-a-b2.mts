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
//   5. Populate (solo con --populate, corre DESPUES del align): trae las mesas
//      de InvGate y las upsertea en mesas; asigna todos los users sin mesa a
//      MDA TI (helpdesk_id/helpdesk_name, requeridos por resolveSessionMesa);
//      y setea los 4 flags de participacion de agents segun el rol del user
//      vinculado (agents.user_id, fallback username). Sin esto la DB queda
//      "sin mesa" (fail-closed) y GET /api/cronograma filtra 0 operadores.
//      Requiere env INVGATE_API_KEY / INVGATE_BASE_URL / INVGATE_API_USERNAME
//      (carga dotenv). Usa fetchInvGateMesas() y hace el upsert con la conexion
//      propia del script (NUNCA syncMesas(): escribe la DB por defecto).
//
// Dry-run por defecto. --apply hace backup WAL-safe y escribe en UNA
// transaccion sincrona, luego corre la Fase 4 (que tiene su propio backup) y
// la Fase 5 (--populate). Nunca borra filas ni agentes (el saneo de
// hidden_helpdesks es la unica excepcion: solo elimina filas huerfanas sin
// padre posible).
import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join, basename } from "path";
import {
  buildNameToAgentId,
  resolveAgentIdByName,
} from "../src/lib/scheduleLinks";
import { normalizeRole } from "../src/lib/rbac";
import { MDA_TI_HELPDESK } from "../src/lib/helpdeskAccess";

export type BootstrapOptions = {
  dbPath: string;
  apply: boolean;
  skipAlign?: boolean;
  populate?: boolean;
  fetchMesas?: () => Promise<
    Array<{ invgateId: number; name: string; displayName: string | null }>
  >;
};

export type ParticipationFlags = {
  enCronograma: boolean;
  asignableCubic: boolean;
  incluidoCalidad: boolean;
  asignableAgs: boolean;
};

const NO_PARTICIPATION: ParticipationFlags = {
  enCronograma: false,
  asignableCubic: false,
  incluidoCalidad: false,
  asignableAgs: false,
};

// Mapeo rol -> flags de participacion (Fase 5). Roles conocidos: supervisor
// no participa; team_leader/referent figuran en cronograma y cubics pero no
// en calidad/AGS; agent/admin participan en todo. Cualquier rol desconocido
// (o vacio) cae a todos-false (fail-closed, igual que mesas).
export function participationFlagsForRole(role: string): ParticipationFlags {
  const cleaned = String(role ?? "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const known = new Set([
    "admin",
    "supervisor",
    "team leader",
    "referent",
    "referente",
    "agent",
  ]);
  if (!known.has(cleaned)) return { ...NO_PARTICIPATION };

  switch (normalizeRole(role)) {
    case "supervisor":
      return { ...NO_PARTICIPATION };
    case "team_leader":
    case "referent":
      return {
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: false,
        asignableAgs: false,
      };
    case "agent":
    case "admin":
      return {
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      };
    default:
      return { ...NO_PARTICIPATION };
  }
}

export type BootstrapReport = {
  phases: {
    diagnostics: string;
    columns: string;
    backfill: string;
    orphans: string;
    saneo: string;
    align: string;
    populate: string;
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
  mesasSynced: { added: number; updated: number };
  mesasSkippedNameConflict: string[];
  mdaTiInvgateId: number | null;
  usersAssignedToMesa: number;
  agentsFlagsUpdated: number;
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

type MesaFetched = {
  invgateId: number;
  name: string;
  displayName?: string | null;
};

// Fase 5 — populate (idempotente). Detecta columnas/tabla directamente (no
// asume que el align corrio): si faltan, se omite con mensaje explicito.
// Toda la escritura va en UNA transaccion sincrona; el fetch de mesas ya
// ocurrio ANTES (en runBootstrap). Nunca llama a syncMesas().
function phase5Populate(
  db: Database.Database,
  apply: boolean,
  report: BootstrapReport,
  mesasList: MesaFetched[] | null,
  fetchError: string | null,
): void {
  const mesasExists = tableExists(db, "mesas");
  const userCols = new Set(tableInfo(db, "users").map((c) => c.name));
  const agentCols = new Set(tableInfo(db, "agents").map((c) => c.name));
  const flagCols = [
    "en_cronograma",
    "asignable_cubic",
    "incluido_calidad",
    "asignable_ags",
  ];
  const hasUserMesa =
    userCols.has("helpdesk_id") && userCols.has("helpdesk_name");
  const hasFlags = flagCols.every((c) => agentCols.has(c));
  const hasUserLink = agentCols.has("user_id");
  // Las columnas/tabla que el align agrega. Si faltan, la fase NO puede mutar,
  // pero igual previsualiza los counts planificados (dry-run honesto pre-align).
  const colsReady = mesasExists && hasUserMesa && hasFlags;

  if (fetchError) {
    report.phases.populate = `error en fetch de mesas: ${fetchError}`;
    return;
  }
  if (!mesasList) {
    report.phases.populate = "omitido (sin datos de mesas)";
    return;
  }

  // Dedupe por invgateId Y por name: ambas columnas son UNIQUE. Si un name ya
  // existe bajo un invgate_id distinto, el upsert ON CONFLICT(invgate_id)
  // chocaria contra UNIQUE(name) y abortaria la tx: se saltea y se reporta.
  const existingByName = new Map<string, number>();
  if (mesasExists) {
    for (const r of db
      .prepare("SELECT invgate_id, name FROM mesas")
      .all() as Array<{ invgate_id: number; name: string }>) {
      existingByName.set(r.name, r.invgate_id);
    }
  }
  const skippedNameConflict: string[] = [];
  const seen = new Set<number>();
  const plannedNames = new Set<string>();
  const list = mesasList.filter((m) => {
    if (seen.has(m.invgateId)) return false;
    seen.add(m.invgateId);
    const conflictId = existingByName.get(m.name);
    if (conflictId !== undefined && conflictId !== m.invgateId) {
      skippedNameConflict.push(
        `${m.name} (invgate_id ${m.invgateId} vs existente ${conflictId})`,
      );
      return false;
    }
    if (plannedNames.has(m.name)) {
      skippedNameConflict.push(`${m.name} (nombre duplicado en fetch)`);
      return false;
    }
    plannedNames.add(m.name);
    return true;
  });
  report.mesasSkippedNameConflict = skippedNameConflict;

  const existingIds = new Set<number>(
    mesasExists
      ? (db.prepare("SELECT invgate_id FROM mesas").all() as Array<{
          invgate_id: number;
        }>).map((r) => r.invgate_id)
      : [],
  );
  let added = 0;
  let updated = 0;
  for (const m of list) {
    if (existingIds.has(m.invgateId)) updated++;
    else added++;
  }

  // Resolver MDA TI: la fila local (si el upsert ya corrio) o, en dry-run,
  // la recien traida de InvGate.
  let mdaTiInvgateId: number | null = null;
  if (mesasExists) {
    const localRow = db
      .prepare("SELECT invgate_id FROM mesas WHERE name = ? AND active = 1")
      .get(MDA_TI_HELPDESK) as { invgate_id: number } | undefined;
    if (localRow) mdaTiInvgateId = localRow.invgate_id;
  }
  if (mdaTiInvgateId == null) {
    const fetchedRow = list.find((m) => m.name === MDA_TI_HELPDESK);
    if (fetchedRow) mdaTiInvgateId = fetchedRow.invgateId;
  }
  if (mdaTiInvgateId == null) {
    report.mesasSynced = { added, updated };
    report.mdaTiInvgateId = null;
    if (apply && colsReady) {
      throw new Error(`no se encontró la mesa ${MDA_TI_HELPDESK} en InvGate`);
    }
    report.phases.populate = colsReady
      ? `mesa "${MDA_TI_HELPDESK}" ausente en InvGate (dry-run)`
      : `preview (requiere align para aplicar): mesa "${MDA_TI_HELPDESK}" ausente en InvGate`;
    return;
  }

  const userWhere =
    "helpdesk_id IS NULL OR helpdesk_id <> ? OR helpdesk_name IS NULL OR helpdesk_name <> ?";

  const userRows = db
    .prepare("SELECT id, username, role FROM users")
    .all() as Array<{ id: number; username: string; role: string }>;
  const roleById = new Map(userRows.map((u) => [u.id, u.role]));
  const roleByUsername = new Map(
    userRows.map((u) => [String(u.username ?? "").toLowerCase(), u.role]),
  );

  // Preview del conteo de users aun sin columnas helpdesk (pre-align): sin
  // columna no hay nada asignado -> todos los users cuentan como a-asignar.
  const usersAssignedToMesa = hasUserMesa
    ? (db
        .prepare(`SELECT COUNT(*) c FROM users WHERE ${userWhere}`)
        .get(mdaTiInvgateId, MDA_TI_HELPDESK) as { c: number }).c
    : (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;

  // El calculo de flags es puro (rol del user): se computa aun sin columnas de
  // flags. Si faltan, current = 0 -> todo cuenta como a-setear.
  const flagSelect = hasFlags
    ? "en_cronograma, asignable_cubic, incluido_calidad, asignable_ags"
    : "0 AS en_cronograma, 0 AS asignable_cubic, 0 AS incluido_calidad, 0 AS asignable_ags";
  const agents = db
    .prepare(
      `SELECT id, username, ${hasUserLink ? "user_id" : "NULL AS user_id"}, ` +
        `${flagSelect} FROM agents`,
    )
    .all() as Array<{
    id: number;
    username: string | null;
    user_id: number | null;
    en_cronograma: number;
    asignable_cubic: number;
    incluido_calidad: number;
    asignable_ags: number;
  }>;

  const flagPlan: Array<{ id: number; target: number[] }> = [];
  for (const agent of agents) {
    let role: string | null = null;
    if (agent.user_id != null) role = roleById.get(agent.user_id) ?? null;
    if (role == null && agent.username) {
      role = roleByUsername.get(String(agent.username).toLowerCase()) ?? null;
    }
    const flags = participationFlagsForRole(role ?? "");
    const target = [
      flags.enCronograma ? 1 : 0,
      flags.asignableCubic ? 1 : 0,
      flags.incluidoCalidad ? 1 : 0,
      flags.asignableAgs ? 1 : 0,
    ];
    const current = [
      agent.en_cronograma ? 1 : 0,
      agent.asignable_cubic ? 1 : 0,
      agent.incluido_calidad ? 1 : 0,
      agent.asignable_ags ? 1 : 0,
    ];
    if (target.some((v, i) => v !== current[i])) {
      flagPlan.push({ id: agent.id, target });
    }
  }

  report.mesasSynced = { added, updated };
  report.mdaTiInvgateId = mdaTiInvgateId;
  report.usersAssignedToMesa = usersAssignedToMesa;
  report.agentsFlagsUpdated = flagPlan.length;

  const conflictNote = skippedNameConflict.length
    ? `, ${skippedNameConflict.length} mesas salteadas por nombre`
    : "";

  // Columnas faltantes: preview honesto, mutacion gated (ni dry-run ni apply
  // escriben hasta que corra el align).
  if (!colsReady) {
    report.phases.populate =
      "preview (requiere align para aplicar): " +
      `${added} mesas nuevas, ${updated} actualizadas, ` +
      `${usersAssignedToMesa} users -> mesa, ${flagPlan.length} agents flags` +
      conflictNote;
    return;
  }

  if (!apply) {
    report.phases.populate =
      `dry-run: ${added} mesas nuevas, ${updated} actualizadas, ` +
      `${usersAssignedToMesa} users -> mesa, ${flagPlan.length} agents flags` +
      conflictNote;
    return;
  }

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    const upsert = db.prepare(
      "INSERT INTO mesas (invgate_id, name, display_name, active, last_synced_at) " +
        "VALUES (?, ?, ?, 1, ?) " +
        "ON CONFLICT(invgate_id) DO UPDATE SET " +
        "name = excluded.name, display_name = excluded.display_name, " +
        "active = 1, last_synced_at = excluded.last_synced_at",
    );
    for (const m of list) {
      upsert.run(m.invgateId, m.name, m.displayName ?? null, now);
    }

    const assigned = db
      .prepare(
        `UPDATE users SET helpdesk_id = ?, helpdesk_name = ? WHERE ${userWhere}`,
      )
      .run(mdaTiInvgateId, MDA_TI_HELPDESK, mdaTiInvgateId, MDA_TI_HELPDESK);
    report.usersAssignedToMesa = assigned.changes;

    const upd = db.prepare(
      "UPDATE agents SET en_cronograma = ?, asignable_cubic = ?, " +
        "incluido_calidad = ?, asignable_ags = ? WHERE id = ?",
    );
    for (const p of flagPlan) {
      upd.run(p.target[0], p.target[1], p.target[2], p.target[3], p.id);
    }
  });
  tx();

  report.phases.populate =
    `${added} mesas nuevas, ${updated} actualizadas, ` +
    `${report.usersAssignedToMesa} users -> mesa, ${flagPlan.length} agents flags` +
    conflictNote;
}

export async function runBootstrap(
  options: BootstrapOptions,
): Promise<BootstrapReport> {
  const { dbPath, apply, skipAlign = false, populate = false } = options;
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
        populate: populate ? "pendiente (fase 5)" : "omitido (sin --populate)",
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
      mesasSynced: { added: 0, updated: 0 },
      mesasSkippedNameConflict: [],
      mdaTiInvgateId: null,
      usersAssignedToMesa: 0,
      agentsFlagsUpdated: 0,
      backupPath: null,
      alignRan: false,
    };

    // ── Fase 5 — fetch de mesas (antes de cualquier escritura) ───────────────
    // Se trae antes del apply para que un fallo de red/env aborte el --apply
    // sin haber escrito nada (la DB queda intacta). El upsert/assign real
    // corre despues del align. Con fetchMesas inyectado (tests) no se importa
    // dotenv ni mesaSync (que abriria la DB por defecto).
    let mesasList: MesaFetched[] | null = null;
    let mesasFetchError: string | null = null;
    if (populate) {
      try {
        if (options.fetchMesas) {
          mesasList = await options.fetchMesas();
        } else {
          await import("dotenv/config");
          const { fetchInvGateMesas } = await import(
            "../src/lib/permissions/mesaSync"
          );
          mesasList = await fetchInvGateMesas();
        }
      } catch (error) {
        mesasFetchError =
          error instanceof Error ? error.message : String(error);
        if (apply) throw error;
      }
    }

    const hasWork =
      columnsAdded.length > 0 ||
      agentLinks.length > 0 ||
      schedulePlan.length > 0;

    // ── Dry-run ─────────────────────────────────────────────────────────────
    if (!apply) {
      report.phases.align = skipAlign
        ? "omitido (skipAlign)"
        : "pendiente: correr align-db-to-schema tras --apply";
      if (populate) {
        phase5Populate(db, false, report, mesasList, mesasFetchError);
      } else {
        report.phases.populate = "omitido (sin --populate)";
      }
      return report;
    }

    // ── Apply ───────────────────────────────────────────────────────────────
    // Backup si hay trabajo de fases 1-3, saneo, o populate: --apply --populate
    // sobre una DB ya migrada (hasWork/saneoWork=false) igual escribe mesas,
    // users y flags, y debe respetar el contrato de backup WAL-safe.
    if (hasWork || saneoWork || (apply && populate)) {
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
    } else {
      const cmd = `npx tsx scripts/align-db-to-schema.mts "${dbPath}"`;
      execSync(cmd, { cwd: process.cwd(), stdio: "inherit" });
      report.alignRan = true;
      report.phases.align = "ejecutado (align-db-to-schema)";
    }

    // ── Fase 5 — populate (corre DESPUES del align) ─────────────────────────
    if (populate) {
      phase5Populate(db, apply, report, mesasList, mesasFetchError);
    } else {
      report.phases.populate = "omitido (sin --populate)";
    }
    return report;
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const skipAlign = args.includes("--no-align");
  const populate = args.includes("--populate");
  const dbFlagIndex = args.indexOf("--db");
  const dbPath =
    dbFlagIndex !== -1 && args[dbFlagIndex + 1]
      ? args[dbFlagIndex + 1]
      : join(process.cwd(), "database", "mda.db");

  const report = await runBootstrap({ dbPath, apply, skipAlign, populate });

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
  console.log(`  5 populate    : ${report.phases.populate}`);

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
  if (populate) {
    console.log(
      `mesas InvGate          : ${report.mesasSynced.added} nuevas, ${report.mesasSynced.updated} actualizadas`,
    );
    console.log(`MDA TI invgate_id       : ${report.mdaTiInvgateId ?? "(ausente)"}`);
    console.log(
      `users -> mesa           : ${report.usersAssignedToMesa} ${apply ? "asignados" : "a asignar (dry-run)"}`,
    );
    console.log(
      `agents flags            : ${report.agentsFlagsUpdated} ${apply ? "actualizados" : "a actualizar (dry-run)"}`,
    );
    if (report.mesasSkippedNameConflict.length > 0) {
      console.log(
        `mesas salteadas (nombre) : ${report.mesasSkippedNameConflict.length}`,
      );
      for (const m of report.mesasSkippedNameConflict.slice(0, 20)) {
        console.log(`  - ${m}`);
      }
    }
  }

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
    console.log("Usá --populate para la fase 5 (mesas InvGate + users->mesa + flags por rol).");
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
