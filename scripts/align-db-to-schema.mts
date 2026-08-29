/**
 * align-db-to-schema — alinea la base de datos con src/db/schema.ts SIN usar
 * drizzle-kit push (no converge en esta DB: recreate + CREATE INDEX duplicado)
 * y sin perder datos.
 *
 * Qué hace (todo idempotente, seguro para correr N veces):
 *   1. Backup consistente (API backup de SQLite, incluye WAL)
 *   2. Limpia tablas basura __new_* de pushes fallidos
 *   3. Agrega columnas faltantes vía ALTER (chequea PRAGMA table_info)
 *   4. Limpia huérfanos que violarían FKs nuevos (hidden_helpdesks)
 *   5. Recrea tablas donde SQLite no permite ALTER de constraint
 *      (users: CHECK role; sessions/hidden_helpdesks: FK) preservando datos
 *   6. Crea índices faltantes (IF NOT EXISTS)
 *   7. Verifica: paridad columnas+orden vs schema, FKs, CHECK,
 *      foreign_key_check, integrity_check, conteos de filas
 *
 * Uso:
 *   npx tsx scripts/align-db-to-schema.mts [ruta-db]
 *   (default: ./database/mda.db)
 *
 * NOTA: no reemplaza a las migraciones futuras — si cambiás src/db/schema.ts,
 * extendé las secciones COLUMN_ADDS / REBUILDS / INDEXES de este script.
 */
import Database from "better-sqlite3";
import * as schema from "../src/db/schema";
import { getTableName, getTableColumns } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { renameSync } from "fs";

const dbPath = process.argv[2] ?? "./database/mda.db";
const backupPath = dbPath.replace(/\.db$/, "") + `.bak-align-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`;

console.log(`DB objetivo: ${dbPath}`);

// ─────────────────────────────────────────────────────────────────────────────
// Definiciones (gold reference: DDL producida por drizzle en la DB alineada)
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_ADDS: Record<string, Array<{ col: string; ddl: string }>> = {
  users: [
    { col: "helpdesk_id", ddl: "ALTER TABLE users ADD COLUMN helpdesk_id INTEGER REFERENCES mesas(invgate_id)" },
    { col: "helpdesk_name", ddl: "ALTER TABLE users ADD COLUMN helpdesk_name TEXT" },
  ],
  agents: [
    { col: "en_cronograma", ddl: "ALTER TABLE agents ADD COLUMN en_cronograma INTEGER NOT NULL DEFAULT 0" },
    { col: "asignable_cubic", ddl: "ALTER TABLE agents ADD COLUMN asignable_cubic INTEGER NOT NULL DEFAULT 0" },
    { col: "incluido_calidad", ddl: "ALTER TABLE agents ADD COLUMN incluido_calidad INTEGER NOT NULL DEFAULT 0" },
    { col: "asignable_ags", ddl: "ALTER TABLE agents ADD COLUMN asignable_ags INTEGER NOT NULL DEFAULT 0" },
  ],
  sessions: [{ col: "fingerprint", ddl: "ALTER TABLE sessions ADD COLUMN fingerprint TEXT" }],
  audit_logs: [
    { col: "entity_type", ddl: "ALTER TABLE audit_logs ADD COLUMN entity_type TEXT" },
    { col: "entity_id", ddl: "ALTER TABLE audit_logs ADD COLUMN entity_id INTEGER" },
    { col: "before_state", ddl: "ALTER TABLE audit_logs ADD COLUMN before_state TEXT" },
    { col: "after_state", ddl: "ALTER TABLE audit_logs ADD COLUMN after_state TEXT" },
  ],
};

const REBUILDS: Record<
  string,
  { needsRebuild: (db: Database.Database) => boolean; ddl: string; copyColumns: string; postIndexes: string[] }
> = {
  // CHECK constraint: SQLite no permite agregarlo por ALTER
  users: {
    needsRebuild: (db) => {
      const ddl = tableDDL(db, "users");
      return !ddl.includes("users_role_check") || !columnOrderMatches(db, schema.users);
    },
    ddl: `CREATE TABLE "__align_users" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`username\` text NOT NULL,
\t\`password\` text NOT NULL,
\t\`role\` text DEFAULT 'agent' NOT NULL,
\t\`helpdesk_id\` integer,
\t\`helpdesk_name\` text,
\tFOREIGN KEY (\`helpdesk_id\`) REFERENCES \`mesas\`(\`invgate_id\`) ON UPDATE no action ON DELETE set null,
\tCONSTRAINT "users_role_check" CHECK("role" in ('admin', 'supervisor', 'team_leader', 'referent', 'agent'))
)`,
    copyColumns: "id, username, password, role, helpdesk_id, helpdesk_name",
    postIndexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`)",
    ],
  },
  // FK sobre columna existente: ALTER no puede agregarla
  sessions: {
    needsRebuild: (db) =>
      !db
        .prepare("PRAGMA foreign_key_list(sessions)")
        .all()
        .some((f: any) => f.table === "users" && f.from === "userId" && f.to === "id") ||
      !columnOrderMatches(db, schema.sessions),
    ddl: `CREATE TABLE "__align_sessions" (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`userId\` integer NOT NULL,
\t\`expiresAt\` integer NOT NULL,
\t\`fingerprint\` text,
\tFOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
)`,
    copyColumns: "id, userId, expiresAt, fingerprint",
    postIndexes: [],
  },
  hidden_helpdesks: {
    needsRebuild: (db) =>
      !db
        .prepare("PRAGMA foreign_key_list(hidden_helpdesks)")
        .all()
        .some(
          (f: any) =>
            f.table === "mesas" && f.from === "invgate_id" && f.to === "invgate_id" && f.on_delete === "CASCADE",
        ) || !columnOrderMatches(db, schema.hiddenHelpdesks),
    ddl: `CREATE TABLE "__align_hidden_helpdesks" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`invgate_id\` integer NOT NULL,
\t\`hidden_by\` text NOT NULL,
\t\`hidden_at\` text NOT NULL,
\tFOREIGN KEY (\`invgate_id\`) REFERENCES \`mesas\`(\`invgate_id\`) ON UPDATE no action ON DELETE cascade
)`,
    copyColumns: "id, invgate_id, hidden_by, hidden_at",
    postIndexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS `hidden_helpdesks_invgate_id_unique` ON `hidden_helpdesks` (`invgate_id`)",
    ],
  },
  // Orden de columnas desalineado respecto al schema (drizzle push los
  // recrearía en loop). Rebuild genérico con DDL gold.
  agents: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.agents),
    ddl: `CREATE TABLE "__align_agents" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`name\` text NOT NULL,
\t\`username\` text,
\t\`avatar_initials\` text,
\t\`notes\` text,
\t\`location\` text DEFAULT 'Monte Grande' NOT NULL,
\t\`horario_default\` text DEFAULT '' NOT NULL,
\t\`esquema_semanal\` text,
\t\`esquema_horario\` text,
\t\`esquema_break_inicio\` text,
\t\`esquema_break_fin\` text,
\t\`max_consecutive_ho\` integer,
\t\`min_p_week\` integer,
\t\`last_autogestion_assigned_at\` integer,
\t\`last_autogestion_assigned_by\` text,
\t\`last_autogestion_undo\` integer,
\t\`estado_excepcional\` text,
\t\`estado_excepcional_motivo\` text,
\t\`estado_excepcional_at\` integer,
\t\`estado_excepcional_minutos\` integer,
\t\`saturday_group\` text,
\t\`saturday_horario\` text,
\t\`en_cronograma\` integer DEFAULT false NOT NULL,
\t\`asignable_cubic\` integer DEFAULT false NOT NULL,
\t\`incluido_calidad\` integer DEFAULT false NOT NULL,
\t\`asignable_ags\` integer DEFAULT false NOT NULL
)`,
    copyColumns:
      "id, name, username, avatar_initials, notes, location, horario_default, esquema_semanal, esquema_horario, esquema_break_inicio, esquema_break_fin, max_consecutive_ho, min_p_week, last_autogestion_assigned_at, last_autogestion_assigned_by, last_autogestion_undo, estado_excepcional, estado_excepcional_motivo, estado_excepcional_at, estado_excepcional_minutos, saturday_group, saturday_horario, en_cronograma, asignable_cubic, incluido_calidad, asignable_ags",
    postIndexes: ["CREATE UNIQUE INDEX IF NOT EXISTS `agents_name_unique` ON `agents` (`name`)"],
  },
  employees: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.employees),
    ddl: `CREATE TABLE "__align_employees" (
\t\`dni\` text PRIMARY KEY NOT NULL,
\t\`username\` text NOT NULL,
\t\`fullname\` text NOT NULL,
\t\`interno\` text,
\t\`telefono\` text,
\t\`sucursal\` text,
\t\`invgate_exists\` integer DEFAULT false,
\t\`invgate_id\` integer,
\t\`position\` text,
\t\`updated_at\` text DEFAULT (CURRENT_TIMESTAMP)
)`,
    copyColumns: "dni, username, fullname, interno, telefono, sucursal, invgate_exists, invgate_id, position, updated_at",
    postIndexes: [],
  },
  office_invgate_links: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.officeInvgateLinks),
    ddl: `CREATE TABLE "__align_office_invgate_links" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`office_id\` integer NOT NULL,
\t\`invgate_location_id\` integer NOT NULL,
\t\`invgate_parent_id\` integer,
\t\`invgate_parent_name\` text,
\t\`invgate_display_name\` text,
\t\`invgate_cp\` text,
\t\`invgate_cc\` text,
\t\`invgate_address\` text,
\t\`invgate_duplicate_count\` integer DEFAULT 0,
\t\`invgate_user_total\` integer DEFAULT 0,
\t\`last_synced_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')),
\tFOREIGN KEY (\`office_id\`) REFERENCES \`offices\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
    copyColumns:
      "id, office_id, invgate_location_id, invgate_parent_id, invgate_parent_name, invgate_display_name, invgate_cp, invgate_cc, invgate_address, invgate_duplicate_count, invgate_user_total, last_synced_at, created_at",
    postIndexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS `office_invgate_links_office_id_unique` ON `office_invgate_links` (`office_id`)",
    ],
  },
  offices: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.offices),
    ddl: `CREATE TABLE "__align_offices" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`code\` text NOT NULL,
\t\`name\` text NOT NULL,
\t\`type\` text NOT NULL,
\t\`provinceCode\` text NOT NULL,
\t\`address\` text,
\t\`lat\` real,
\t\`lng\` real,
\t\`email\` text,
\t\`notes\` text,
\t\`street\` text,
\t\`number\` text,
\t\`locality\` text,
\t\`county\` text,
\t\`zone\` text,
\t\`officeType\` text,
\t\`categoryClass\` text,
\t\`rubric\` text,
\t\`parentNis\` text,
\t\`phone\` text,
\t\`manager\` text,
\t\`regionId\` text,
\t\`enRed\` integer DEFAULT false,
\t\`paqarAdmision\` integer DEFAULT false,
\t\`paqarEntrega\` integer DEFAULT false,
\t\`payroll\` integer DEFAULT false,
\t\`tax_exempt\` integer DEFAULT false,
\t\`division\` text,
\t\`company\` text,
\t\`warehouse\` text,
\t\`profit_center\` text,
\t\`cct_admin_office\` text,
\t\`cc_commercial\` text,
\t\`cc_commercial_corp\` text,
\t\`cc_electoral\` text,
\t\`cc_network_mgmt\` text,
\t\`cc_operations\` text,
\t\`cc_operational\` text,
\t\`cc_hr\` text,
\t\`cc_security\` text,
\t\`cc_admin\` text,
\t\`cc_admission\` text,
\t\`cc_ctp\` text,
\t\`cc_ctt\` text,
\t\`cc_transport\` text,
\t\`cc_logistics\` text,
\t\`pos_auto_auto\` text,
\t\`pos_current_account\` text,
\t\`pos_manual\` text,
\t\`pos_manual_auto\` text,
\t\`pos_planta_mg\` text,
\t\`pos_virtual\` text,
\t\`pos_auto_auto_2\` text,
\t\`pos_sap_terminal\` text,
\t\`searchable_text\` text,
\t\`active\` integer DEFAULT true,
\t\`closed_reason\` text,
\tFOREIGN KEY (\`provinceCode\`) REFERENCES \`provinces\`(\`code\`) ON UPDATE no action ON DELETE no action
)`,
    copyColumns:
      "id, code, name, type, provinceCode, address, lat, lng, email, notes, street, number, locality, county, zone, officeType, categoryClass, rubric, parentNis, phone, manager, regionId, enRed, paqarAdmision, paqarEntrega, payroll, tax_exempt, division, company, warehouse, profit_center, cct_admin_office, cc_commercial, cc_commercial_corp, cc_electoral, cc_network_mgmt, cc_operations, cc_operational, cc_hr, cc_security, cc_admin, cc_admission, cc_ctp, cc_ctt, cc_transport, cc_logistics, pos_auto_auto, pos_current_account, pos_manual, pos_manual_auto, pos_planta_mg, pos_virtual, pos_auto_auto_2, pos_sap_terminal, searchable_text, active, closed_reason",
    postIndexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS `offices_code_unique` ON `offices` (`code`)",
      "CREATE INDEX IF NOT EXISTS `province_idx` ON `offices` (`provinceCode`)",
      "CREATE INDEX IF NOT EXISTS `locality_idx` ON `offices` (`locality`)",
      "CREATE INDEX IF NOT EXISTS `name_idx` ON `offices` (`name`)",
      "CREATE INDEX IF NOT EXISTS `type_idx` ON `offices` (`type`)",
    ],
  },
  operator_attendance: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.operatorAttendance),
    ddl: `CREATE TABLE "__align_operator_attendance" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`agent_id\` integer NOT NULL,
\t\`date\` text NOT NULL,
\t\`asistencia\` text,
\t\`ausencia\` text,
\t\`entrada_real\` text,
\t\`salida_real\` text,
\t\`horario_estipulado\` text,
\t\`cumplimiento\` text,
\t\`cumplimiento_forzado\` integer DEFAULT false,
\t\`motivo_loguin\` text,
\t\`detalle\` text,
\t\`shift_type\` text DEFAULT 'normal' NOT NULL,
\tFOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
    copyColumns:
      "id, agent_id, date, asistencia, ausencia, entrada_real, salida_real, horario_estipulado, cumplimiento, cumplimiento_forzado, motivo_loguin, detalle, shift_type",
    postIndexes: [
      "CREATE INDEX IF NOT EXISTS `operator_attendance_agent_date_idx` ON `operator_attendance` (`agent_id`,`date`,`shift_type`)",
      "CREATE INDEX IF NOT EXISTS `operator_attendance_date_idx` ON `operator_attendance` (`date`)",
    ],
  },
  saturday_rotation_config: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.saturdayRotationConfig),
    ddl: `CREATE TABLE "__align_saturday_rotation_config" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`month\` text NOT NULL,
\t\`rotation_order\` text DEFAULT 'A,B,C,D' NOT NULL,
\t\`start_date\` text DEFAULT '2026-06-06' NOT NULL,
\t\`start_group\` text DEFAULT 'A' NOT NULL,
\t\`disabled_groups\` text DEFAULT '' NOT NULL
)`,
    copyColumns: "id, month, rotation_order, start_date, start_group, disabled_groups",
    postIndexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS `saturday_rotation_config_month_unique` ON `saturday_rotation_config` (`month`)",
    ],
  },
  support_guides: {
    needsRebuild: (db) => !columnOrderMatches(db, schema.supportGuides),
    ddl: `CREATE TABLE "__align_support_guides" (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`invgate_id\` integer,
\t\`categories\` text,
\t\`legacy_name\` text,
\t\`route\` text,
\t\`topics\` text,
\t\`contacts\` text,
\t\`referents\` text,
\t\`notes\` text,
\t\`searchable_text\` text
)`,
    copyColumns: "id, invgate_id, categories, legacy_name, route, topics, contacts, referents, notes, searchable_text",
    postIndexes: [],
  },
};

const INDEXES: string[] = [
  "CREATE UNIQUE INDEX IF NOT EXISTS `agent_month_unique_idx` ON `agent_saturday_groups` (`agent_id`,`month`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `agents_name_unique` ON `agents` (`name`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `audit_parameters_code_unique` ON `audit_parameters` (`code`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `cubics_name_unique` ON `cubics` (`name`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `employee_offices_username_sucursal_idx` ON `employee_offices` (`username`,`sucursal`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `holidays_date_unique` ON `holidays` (`date`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `mesas_invgate_id_unique` ON `mesas` (`invgate_id`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `mesas_name_unique` ON `mesas` (`name`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `module_access_unique_idx` ON `module_access` (`module_id`,`role`,`mesa_id`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `modules_name_unique` ON `modules` (`name`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `office_invgate_links_office_id_unique` ON `office_invgate_links` (`office_id`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `offices_code_unique` ON `offices` (`code`)",
  "CREATE INDEX IF NOT EXISTS `operator_attendance_agent_date_idx` ON `operator_attendance` (`agent_id`,`date`,`shift_type`)",
  "CREATE INDEX IF NOT EXISTS `operator_attendance_date_idx` ON `operator_attendance` (`date`)",
  "CREATE INDEX IF NOT EXISTS `overtime_shifts_agent_idx` ON `weekend_overtime_shifts` (`agent_id`)",
  "CREATE INDEX IF NOT EXISTS `overtime_shifts_weekend_start_idx` ON `weekend_overtime_shifts` (`weekend_start_date`)",
  "CREATE INDEX IF NOT EXISTS `province_idx` ON `offices` (`provinceCode`)",
  "CREATE INDEX IF NOT EXISTS `quality_audits_month_idx` ON `quality_audits` (`month`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `route_access_unique_idx` ON `route_access` (`route_id`,`role`,`mesa_id`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `routes_path_unique` ON `routes` (`path`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `saturday_rotation_config_month_unique` ON `saturday_rotation_config` (`month`)",
  "CREATE INDEX IF NOT EXISTS `schedules_agent_name_idx` ON `schedules` (`agent_name`)",
  "CREATE INDEX IF NOT EXISTS `schedules_date_idx` ON `schedules` (`date`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `terminals_hostname_unique` ON `terminals` (`hostname`)",
  "CREATE INDEX IF NOT EXISTS `terminals_nis_idx` ON `terminals` (`nis`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `title_category_name_unique` ON `title_category` (`name`)",
  "CREATE INDEX IF NOT EXISTS `locality_idx` ON `offices` (`locality`)",
  "CREATE INDEX IF NOT EXISTS `name_idx` ON `offices` (`name`)",
  "CREATE INDEX IF NOT EXISTS `type_idx` ON `offices` (`type`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `weekend_overtime_config_weekend_start_date_unique` ON `weekend_overtime_config` (`weekend_start_date`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `weekly_guardia_pasiva_assignments_start_date_unique` ON `weekly_guardia_pasiva_assignments` (`start_date`)",
];

function tableDDL(db: Database.Database, table: string): string {
  return ((db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as any)?.sql ?? "");
}

// Orden de columnas en schema (drizzle) — para detectar desalineación estructural
function schemaColumnOrder(table: SQLiteTable): string[] {
  return getTableConfig(table).columns.map((c: any) => c.name);
}

function dbColumnOrder(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as any[]).map((c) => c.name);
}

function columnOrderMatches(db: Database.Database, table: SQLiteTable): boolean {
  const name = getTableName(table);
  const dbCols = dbColumnOrder(db, name);
  if (dbCols.length === 0) return false; // tabla inexistente: no es problema de orden
  return JSON.stringify(schemaColumnOrder(table)) === JSON.stringify(dbCols);
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
}

function snapshotCounts(db: Database.Database): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tableNames(db)) {
    if (t.startsWith("__")) continue;
    out[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────────────────────

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

let failed = false;
try {
  // 1. Backup consistente
  await db.backup(backupPath);
  console.log(`[1/7] Backup consistente: ${backupPath}`);

  const before = snapshotCounts(db);

  // 2. Basura de pushes fallidos
  const junk = tableNames(db).filter((t) => t.startsWith("__new_"));
  for (const t of junk) {
    db.prepare(`DROP TABLE "${t}"`).run();
    console.log(`[2/7] DROP basura: ${t}`);
  }
  if (junk.length === 0) console.log("[2/7] Sin tablas basura __new_*");

  // 3. Columnas faltantes
  let added = 0;
  for (const [table, cols] of Object.entries(COLUMN_ADDS)) {
    if (!tableNames(db).includes(table)) throw new Error(`Tabla '${table}' no existe en la DB`);
    const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c: any) => c.name);
    for (const { col, ddl } of cols) {
      if (!existing.includes(col)) {
        db.prepare(ddl).run();
        added++;
        console.log(`[3/7] ALTER ${table}: +${col}`);
      }
    }
  }
  if (added === 0) console.log("[3/7] Columnas: nada pendiente");

  // 4. Huérfanos que violarían FKs nuevos (semántica cascade: la fila solo
  //    tiene sentido mientras la mesa existe). Reporta y limpia.
  const orphans = db
    .prepare("SELECT invgate_id FROM hidden_helpdesks WHERE invgate_id NOT IN (SELECT invgate_id FROM mesas)")
    .all() as any[];
  if (orphans.length > 0) {
    db.prepare("DELETE FROM hidden_helpdesks WHERE invgate_id NOT IN (SELECT invgate_id FROM mesas)").run();
    console.log(`[4/7] hidden_helpdesks huérfanos eliminados: ${orphans.length} (invgate_id: ${orphans.map((o) => o.invgate_id).join(", ")})`);
  } else {
    console.log("[4/7] Sin huérfanos en hidden_helpdesks");
  }

  // 5. Rebuilds condicionales (CHECK/FK que SQLite no permite por ALTER)
  let rebuilt = 0;
  for (const [table, spec] of Object.entries(REBUILDS)) {
    if (!spec.needsRebuild(db)) continue;
    const tmp = `__align_${table}`;
    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(spec.ddl);
      db.prepare(`INSERT INTO "${tmp}" (${spec.copyColumns}) SELECT ${spec.copyColumns} FROM "${table}"`).run();
      db.prepare(`DROP TABLE "${table}"`).run();
      db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    } finally {
      db.pragma("foreign_keys = ON");
    }
    for (const idx of spec.postIndexes) db.prepare(idx).run();
    rebuilt++;
    console.log(`[5/7] Rebuild ${table}: constraints aplicados, datos preservados`);
  }
  if (rebuilt === 0) console.log("[5/7] Rebuilds: nada pendiente");

  // 6. Índices faltantes
  let created = 0;
  for (const ddl of INDEXES) {
    try {
      const info = db.prepare(ddl).run();
      if (info.changes === 0 && !ddl.includes("IF NOT EXISTS")) created++;
      created++; // better-sqlite3 no distingue; correr es barato y seguro
    } catch (e) {
      console.log(`[6/7] WARN índice: ${(e as Error).message}`);
    }
  }
  console.log(`[6/7] Índices: ${INDEXES.length} sentencias IF NOT EXISTS ejecutadas`);

  // 7. Verificación
  console.log("[7/7] Verificación:");

  const fkCheck = db.pragma("foreign_key_check");
  if (fkCheck.length > 0) {
    console.error("  FAIL foreign_key_check:", JSON.stringify(fkCheck).slice(0, 500));
    failed = true;
  } else {
    console.log("  ok: foreign_key_check vacío");
  }

  const integrity = db.pragma("integrity_check")[0] as any;
  if (integrity.integrity_check !== "ok") {
    console.error("  FAIL integrity_check:", integrity.integrity_check);
    failed = true;
  } else {
    console.log("  ok: integrity_check");
  }

  // Paridad columnas (+orden) vs schema
  const drizzleTables: Array<[string, any]> = [];
  for (const value of Object.values(schema)) {
    const v: any = value;
    if (v && typeof v === "object") {
      try {
        const name = getTableName(v);
        if (typeof name === "string") drizzleTables.push([name, v]);
      } catch {
        /* no es tabla */
      }
    }
  }
  let parityFails = 0;
  for (const [tName, table] of drizzleTables) {
    const dbInfo = db.prepare(`PRAGMA table_info("${tName}")`).all() as any[];
    if (dbInfo.length === 0) {
      console.error(`  FAIL tabla faltante: ${tName}`);
      parityFails++;
      continue;
    }
    const config = getTableConfig(table);
    const schemaCols = config.columns.map((c: any) => c.name);
    const dbCols = dbInfo.map((c) => c.name);
    if (JSON.stringify(schemaCols) !== JSON.stringify(dbCols)) {
      console.error(`  FAIL orden/columnas ${tName}:\n    schema=[${schemaCols.join(",")}]\n    db=[${dbCols.join(",")}]`);
      parityFails++;
    }
  }
  if (parityFails === 0) console.log(`  ok: paridad de columnas en ${drizzleTables.length} tablas`);
  else failed = true;

  // CHECK de roles presente
  if (!tableDDL(db, "users").includes("users_role_check")) {
    console.error("  FAIL: users_role_check ausente");
    failed = true;
  } else {
    console.log("  ok: users_role_check presente");
  }

  // Conteos: nada debe perder filas (salvo cleanup explícito de huérfanos)
  const after = snapshotCounts(db);
  let countFails = 0;
  for (const [t, beforeCount] of Object.entries(before)) {
    const afterCount = after[t] ?? 0;
    const allowedLoss = t === "hidden_helpdesks" ? orphans.length : 0;
    if (afterCount < beforeCount - allowedLoss) {
      console.error(`  FAIL filas ${t}: ${beforeCount} -> ${afterCount}`);
      countFails++;
    }
  }
  if (countFails === 0) console.log("  ok: conteos de filas preservados");
  else failed = true;

  if (failed) {
    console.error("\nRESULTADO: FALLÓ — restaurá el backup: " + backupPath);
    process.exit(1);
  }
  console.log("\nRESULTADO: DB alineada al schema sin pérdida de datos.");
  console.log("No corras drizzle-kit push sobre esta DB (no converge en este proyecto).");
  renameSync(backupPath, backupPath); // noop explícito: el backup queda en disco
  console.log(`Backup conservado en: ${backupPath}`);
} catch (e) {
  console.error("ERROR FATAL:", (e as Error).message);
  console.error("Restaurá el backup si la DB quedó inconsistente: " + backupPath);
  process.exit(1);
} finally {
  db.close();
}
