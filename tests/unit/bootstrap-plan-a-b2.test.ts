// tests/unit/bootstrap-plan-a-b2.test.ts
//
// TDD de scripts/bootstrap-plan-a-b2.mts: fases 1-3 sobre un DDL pre-Plan-A.
// La fase 4 (subproceso align-db-to-schema) se excluye con skipAlign: true.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runBootstrap } from "../../scripts/bootstrap-plan-a-b2.mts";

const DDL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL
);
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  username TEXT,
  avatar_initials TEXT,
  location TEXT NOT NULL DEFAULT 'Monte Grande',
  horario_default TEXT NOT NULL DEFAULT ''
);
CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invgate_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT NOT NULL
);
CREATE TABLE hidden_helpdesks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invgate_id INTEGER NOT NULL,
  hidden_by TEXT NOT NULL,
  hidden_at TEXT NOT NULL
);
`;

let dir: string;
let dbPath: string;

function exec(sql: string): void {
  const db = new Database(dbPath);
  db.exec(sql);
  db.close();
}

function seed(): void {
  exec(`
    INSERT INTO users (id, username) VALUES (1, 'jperez'), (2, 'mrojas'), (3, 'fsuarez');
    INSERT INTO agents (id, name, username) VALUES
      (1, 'Juan Perez', 'JPEREZ'),
      (2, 'Maria Rojas', 'mrojas'),
      (3, 'Pedro Gomez', 'pgomez');
    INSERT INTO schedules (agent_name, date, status) VALUES
      ('Juan Perez', '2026-01-01', 'Trabajo'),
      ('Juan Perez', '2026-01-02', 'Trabajo'),
      ('juan perez', '2026-01-03', 'Trabajo'),
      ('Maria Rojas', '2026-01-04', 'Trabajo'),
      ('Pedro Gomez', '2026-01-05', 'Trabajo'),
      ('Huerfano Uno', '2026-01-06', 'Trabajo'),
      ('Huerfano Uno', '2026-01-07', 'Trabajo'),
      ('huerfano uno', '2026-01-08', 'Trabajo'),
      ('Huerfana Dos', '2026-01-09', 'Trabajo');
  `);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bootstrap-a-"));
  dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  db.exec(DDL);
  db.close();
  seed();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function rows<T>(sql: string, path: string = dbPath): T[] {
  const db = new Database(path);
  const out = db.prepare(sql).all() as T[];
  db.close();
  return out;
}

function columnNames(table: string, path: string = dbPath): string[] {
  return rows<{ name: string }>(`PRAGMA table_info("${table}")`, path).map((c) => c.name);
}

describe("runBootstrap", () => {
  it("dry-run: no escribe, no crea backup, planes correctos y columnas ausentes", async () => {
    const report = await runBootstrap({ dbPath, apply: false, skipAlign: true });

    expect(report.backupPath).toBeNull();
    expect(report.alignRan).toBe(false);

    expect(report.agentsLinked).toBe(2); // Juan Perez, Maria Rojas (Pedro Gomez sin user)
    expect(report.agentsNoUser.some((m) => m.includes("Pedro Gomez"))).toBe(true);

    expect(report.schedulesLinked).toBe(5); // 2 + 1 (CI) Juan, Maria, Pedro
    expect(report.schedulesCaseInsensitive.some((m) => m.includes("juan perez"))).toBe(true);

    expect(report.shellsCreated).toBe(2); // Huerfano Uno (dedupe CI) + Huerfana Dos
    expect(report.rowsLinkedToShells).toBe(4); // 3 huerfano uno + 1 huerfana dos
    expect(report.schedulesMissing.some((m) => m.includes("Huerfano Uno"))).toBe(true);

    expect(report.columnsAdded).toHaveLength(3);

    // No escribio: columnas siguen ausentes.
    expect(columnNames("schedules")).not.toContain("agent_id");
    expect(columnNames("agents")).not.toContain("user_id");
  });

  it("apply: agrega columnas, vincula, crea shells, backup y es idempotente", async () => {
    const first = await runBootstrap({ dbPath, apply: true, skipAlign: true });

    expect(first.backupPath).toBeTruthy();
    expect(existsSync(first.backupPath!)).toBe(true);
    expect(first.agentsLinked).toBe(2);
    expect(first.schedulesLinked).toBe(5);
    expect(first.shellsCreated).toBe(2);
    expect(first.rowsLinkedToShells).toBe(4);

    expect(columnNames("schedules")).toContain("agent_id");
    expect(columnNames("agents")).toContain("user_id");

    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c,
    ).toBe(0);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id < 0")[0].c).toBe(0);

    const linked = rows<{ name: string; user_id: number | null }>(
      "SELECT name, user_id FROM agents WHERE name IN ('Juan Perez','Maria Rojas','Pedro Gomez') ORDER BY name",
    );
    expect(linked[0]).toMatchObject({ name: "Juan Perez", user_id: 1 });
    expect(linked[1]).toMatchObject({ name: "Maria Rojas", user_id: 2 });
    expect(linked[2]).toMatchObject({ name: "Pedro Gomez", user_id: null });

    const second = await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(second.agentsLinked).toBe(0);
    expect(second.schedulesLinked).toBe(0);
    expect(second.shellsCreated).toBe(0);
    expect(second.rowsLinkedToShells).toBe(0);
  });

  it("variantes de caso/espacios comparten un unico shell y no escriben ids negativos", async () => {
    const report = await runBootstrap({ dbPath, apply: true, skipAlign: true });

    expect(report.shellsCreated).toBe(2);
    expect(
      rows<{ c: number }>(
        "SELECT COUNT(DISTINCT agent_id) c FROM schedules WHERE lower(trim(agent_name)) = 'huerfano uno'",
      )[0].c,
    ).toBe(1);
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE lower(trim(name)) = 'huerfano uno'")[0]
        .c,
    ).toBe(1);
    expect(
      rows<{ c: number }>("SELECT COUNT(DISTINCT agent_id) c FROM schedules WHERE lower(trim(agent_name)) = 'huerfana dos'")[0]
        .c,
    ).toBe(1);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id < 0")[0].c).toBe(0);
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE trim(name) = ''")[0].c,
    ).toBe(0);
  });

  it("nunca borra filas ni agentes", async () => {
    await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules")[0].c).toBe(9);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents")[0].c).toBe(5); // 3 + 2 shells
  });

  it("nombres solo-whitespace se reportan, no crean shell ni se vinculan", async () => {
    exec(
      "INSERT INTO schedules (agent_name, date, status) VALUES " +
        "('   ', '2026-03-01', 'Trabajo'), (char(9), '2026-03-02', 'Trabajo')",
    );
    const report = await runBootstrap({ dbPath, apply: true, skipAlign: true });

    expect(report.schedulesMissing.some((m) => m.includes("nombre vacío"))).toBe(true);
    expect(report.schedulesMissing.some((m) => m.includes("2 filas"))).toBe(true);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE trim(name) = ''")[0].c).toBe(0);
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c,
    ).toBe(2);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules")[0].c).toBe(11);
  });

  it("username ambiguo (dos users misma lower) -> agente sin vincular y reportado", async () => {
    exec(`
      INSERT INTO users (id, username) VALUES (4, 'Dup'), (5, 'dup');
      INSERT INTO agents (id, name, username) VALUES (4, 'Agent Dup', 'DUP');
      INSERT INTO agents (id, name, username) VALUES (5, 'Normal User', 'other');
      INSERT INTO users (id, username) VALUES (6, 'other');
    `);

    const report = await runBootstrap({ dbPath, apply: true, skipAlign: true });

    expect(report.agentsNoUser.some((m) => m.includes("Agent Dup") && m.includes("ambiguo"))).toBe(
      true,
    );
    expect(
      rows<{ user_id: number | null }>("SELECT user_id FROM agents WHERE name = 'Agent Dup'")[0]
        .user_id,
    ).toBeNull();
    expect(
      rows<{ user_id: number | null }>("SELECT user_id FROM agents WHERE name = 'Normal User'")[0]
        .user_id,
    ).toBe(6);
  });

  it("skipAlign mantiene alignRan en false (dry-run y apply)", async () => {
    const dry = await runBootstrap({ dbPath, apply: false, skipAlign: true });
    expect(dry.alignRan).toBe(false);
    const applied = await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(applied.alignRan).toBe(false);
  });

  it("saneo apply: elimina hidden_helpdesks huerfanas y preserva las validas", async () => {
    exec(`
      INSERT INTO mesas (invgate_id, name, last_synced_at) VALUES (10, 'Mesa 10', '2026-01-01');
      INSERT INTO hidden_helpdesks (invgate_id, hidden_by, hidden_at) VALUES
        (10, 'u', '2026-01-01'),
        (999, 'u', '2026-01-01'),
        (1000, 'u', '2026-01-01');
    `);

    const report = await runBootstrap({ dbPath, apply: true, skipAlign: true });

    expect(report.hiddenHelpdesksPruned).toBe(2);
    expect(report.phases.saneo).toContain("2");
    expect(
      rows<{ invgate_id: number }>("SELECT invgate_id FROM hidden_helpdesks ORDER BY invgate_id").map(
        (r) => r.invgate_id,
      ),
    ).toEqual([10]);
  });

  it("saneo dry-run: cuenta huerfanas sin borrar ninguna fila", async () => {
    exec(`
      INSERT INTO mesas (invgate_id, name, last_synced_at) VALUES (10, 'Mesa 10', '2026-01-01');
      INSERT INTO hidden_helpdesks (invgate_id, hidden_by, hidden_at) VALUES
        (10, 'u', '2026-01-01'),
        (999, 'u', '2026-01-01'),
        (1000, 'u', '2026-01-01');
    `);

    const report = await runBootstrap({ dbPath, apply: false, skipAlign: true });

    expect(report.hiddenHelpdesksPruned).toBe(2);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM hidden_helpdesks")[0].c).toBe(3);
  });

  it("saneo: sin tabla hidden_helpdesks o sin huerfanas -> 0, no crash", async () => {
    const noOrphans = await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(noOrphans.hiddenHelpdesksPruned).toBe(0);

    exec("DROP TABLE hidden_helpdesks");
    const noTable = await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(noTable.hiddenHelpdesksPruned).toBe(0);
    expect(noTable.phases.saneo).toContain("sin tabla");
  });

  it("apply dos veces no duplica shells", async () => {
    await runBootstrap({ dbPath, apply: true, skipAlign: true });
    await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE lower(trim(name)) = 'huerfano uno'")[0]
        .c,
    ).toBe(1);
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE lower(trim(name)) = 'huerfana dos'")[0]
        .c,
    ).toBe(1);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents")[0].c).toBe(5);
  });

  // Fix 1: path prod real (DB pre-Plan-A sin tabla mesas). El saneo debe crear
  // mesas canonica, vaciar hidden_helpdesks huerfanas y dejar backup.
  it("prod path sin mesas: crea mesas canonica, vacia hidden_helpdesks y reporta backup", async () => {
    exec("DROP TABLE mesas");
    exec(`
      INSERT INTO hidden_helpdesks (invgate_id, hidden_by, hidden_at) VALUES
        (999, 'u', '2026-01-01'),
        (1000, 'u', '2026-01-01');
    `);

    const report = await runBootstrap({ dbPath, apply: true, skipAlign: true });

    expect(columnNames("mesas")).toContain("invgate_id");
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM mesas")[0].c).toBe(0);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM hidden_helpdesks")[0].c).toBe(0);
    expect(report.hiddenHelpdesksPruned).toBe(2);
    expect(report.phases.saneo).toContain("mesas creada vacia");
    expect(report.backupPath).toBeTruthy();
    expect(existsSync(report.backupPath!)).toBe(true);
  });

  // Fix 4b: la mesas creada por el bootstrap debe matchear la firma canonica
  // (columnas/tipos/notnull/default/pk) y exponer los UNIQUE de invgate_id/name.
  it("mesas creada por el bootstrap matchea la firma canonica", async () => {
    exec("DROP TABLE mesas");
    exec(
      "INSERT INTO hidden_helpdesks (invgate_id, hidden_by, hidden_at) VALUES (999, 'u', '2026-01-01')",
    );
    await runBootstrap({ dbPath, apply: true, skipAlign: true });

    const info = rows<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>("PRAGMA table_info(mesas)");
    expect(
      info.map((c) => [c.name, c.type, c.notnull, c.dflt_value, c.pk]),
    ).toEqual([
      ["id", "INTEGER", 1, null, 1],
      ["invgate_id", "INTEGER", 1, null, 0],
      ["name", "TEXT", 1, null, 0],
      ["display_name", "TEXT", 0, null, 0],
      ["active", "INTEGER", 1, "true", 0],
      ["last_synced_at", "TEXT", 1, null, 0],
    ]);

    const uniques = rows<{ name: string; unique: number }>("PRAGMA index_list(mesas)").filter(
      (i) => i.unique === 1,
    );
    expect(uniques.length).toBeGreaterThanOrEqual(2);
  });

  // Fix 2: dry-run primero y apply despues sobre la MISMA DB, con segundo
  // apply idempotente (0 counts, sin error).
  it("dry-run -> apply sobre la misma DB y segundo apply idempotente", async () => {
    const dry = await runBootstrap({ dbPath, apply: false, skipAlign: true });
    expect(dry.columnsAdded).toHaveLength(3);
    expect(dry.agentsLinked).toBe(2);
    expect(dry.schedulesLinked).toBe(5);
    expect(dry.backupPath).toBeNull();
    expect(columnNames("schedules")).not.toContain("agent_id");
    expect(columnNames("agents")).not.toContain("user_id");

    const applied = await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(applied.columnsAdded).toHaveLength(3);
    expect(applied.agentsLinked).toBe(2);
    expect(applied.schedulesLinked).toBe(5);
    expect(columnNames("schedules")).toContain("agent_id");
    expect(columnNames("agents")).toContain("user_id");
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c,
    ).toBe(0);

    const second = await runBootstrap({ dbPath, apply: true, skipAlign: true });
    expect(second.agentsLinked).toBe(0);
    expect(second.schedulesLinked).toBe(0);
    expect(second.shellsCreated).toBe(0);
    expect(second.rowsLinkedToShells).toBe(0);
    expect(second.columnsAdded).toHaveLength(0);
  });

  // Fix 3: DB post-B2 (schedules sin agent_name). El script debe no-opear en
  // schedules (0 vinculados, sin crash), agregar columnas faltantes y respetar
  // skipAlign.
  it("post-B2 (sin agent_name): no-op en schedules y agrega columnas faltantes", async () => {
    const postB2 = join(dir, "post-b2.db");
    const db = new Database(postB2);
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL);
      CREATE TABLE agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        username TEXT,
        location TEXT NOT NULL DEFAULT 'Monte Grande',
        horario_default TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER REFERENCES agents(id),
        date TEXT NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO users (id, username) VALUES (1, 'jperez');
      INSERT INTO agents (id, name, username) VALUES (1, 'Juan Perez', 'jperez');
      INSERT INTO schedules (agent_id, date, status) VALUES (1, '2026-01-01', 'Trabajo');
    `);
    db.close();

    const report = await runBootstrap({ dbPath: postB2, apply: true, skipAlign: true });

    expect(report.schedulesLinked).toBe(0);
    expect(report.shellsCreated).toBe(0);
    expect(report.rowsLinkedToShells).toBe(0);
    expect(report.agentsLinked).toBe(1);
    expect(report.alignRan).toBe(false);
    expect(columnNames("agents", postB2)).toContain("user_id");
    expect(columnNames("schedules", postB2)).toContain("agent_id");
  });
});
