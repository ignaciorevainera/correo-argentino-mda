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

function rows<T>(sql: string): T[] {
  const db = new Database(dbPath);
  const out = db.prepare(sql).all() as T[];
  db.close();
  return out;
}

function columnNames(table: string): string[] {
  return rows<{ name: string }>(`PRAGMA table_info("${table}")`).map((c) => c.name);
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
});
