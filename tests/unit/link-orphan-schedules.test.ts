// tests/unit/link-orphan-schedules.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runLinkOrphanSchedules } from "../../scripts/link-orphan-schedules.mts";

const DDL = `
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  en_cronograma INTEGER NOT NULL DEFAULT 0,
  asignable_cubic INTEGER NOT NULL DEFAULT 0,
  incluido_calidad INTEGER NOT NULL DEFAULT 0,
  asignable_ags INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL
);
`;

let dir: string;
let dbPath: string;

function seed(): void {
  const db = new Database(dbPath);
  db.exec(DDL);
  db.prepare("INSERT INTO agents (id, name) VALUES (1, 'Rojas Ramiro')").run();
  db.prepare(
    "INSERT INTO schedules (agent_name, agent_id, date, status) VALUES " +
      "('Rojas Ramiro', 1, '2026-01-01', 'Trabajo')," +
      "('Arce Franco', NULL, '2026-01-02', 'Trabajo')," +
      "('Arce Franco', NULL, '2026-01-03', 'Trabajo')," +
      "('Nadie', NULL, '2026-01-04', 'Trabajo')",
  ).run();
  db.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "link-orphans-"));
  dbPath = join(dir, "test.db");
  seed();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function rows<T>(sql: string): T[] {
  const db = new Database(dbPath);
  const out = db.prepare(sql).all() as T[];
  db.close();
  return out;
}

function exec(sql: string): void {
  const db = new Database(dbPath);
  db.exec(sql);
  db.close();
}

describe("runLinkOrphanSchedules", () => {
  it("dry-run no escribe ni crea backup", async () => {
    const report = await runLinkOrphanSchedules({ dbPath, apply: false });
    expect(report.agentsCreated).toBe(2); // Arce Franco + Nadie
    expect(report.rowsLinked).toBe(3);
    expect(report.shellNames).toEqual([
      { name: "Arce Franco", rows: 2 },
      { name: "Nadie", rows: 1 },
    ]);
    expect(report.backupPath).toBeNull();
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c).toBe(3);
  });

  it("--apply crea agentes-shell, vincula y es idempotente", async () => {
    const first = await runLinkOrphanSchedules({ dbPath, apply: true });
    expect(first.backupPath).toBeTruthy();
    expect(existsSync(first.backupPath!)).toBe(true);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c).toBe(0);
    const arce = rows<{ id: number }>("SELECT id FROM agents WHERE name = 'Arce Franco'");
    expect(arce.length).toBe(1);

    const second = await runLinkOrphanSchedules({ dbPath, apply: true });
    expect(second.agentsCreated).toBe(0);
    expect(second.rowsLinked).toBe(0);
  });

  it("nunca borra filas ni agentes", async () => {
    await runLinkOrphanSchedules({ dbPath, apply: true });
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules")[0].c).toBe(4);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents")[0].c).toBe(3);
  });

  it("variantes de caso/espacios comparten un unico shell y no escriben ids negativos", async () => {
    exec(
      "INSERT INTO schedules (agent_name, agent_id, date, status) VALUES " +
        "('arce franco', NULL, '2026-02-01', 'Trabajo')," +
        "('ARCE FRANCO', NULL, '2026-02-02', 'Trabajo')," +
        "('  Nadie  ', NULL, '2026-02-03', 'Trabajo')",
    );

    const report = await runLinkOrphanSchedules({ dbPath, apply: true });
    expect(report.agentsCreated).toBe(2); // 1 shell Arce + 1 shell Nadie
    expect(report.rowsLinked).toBe(6); // 3 Arce + 2 Nadie (normal + padded)
    expect(report.shellNames.map((s) => s.name).sort()).toEqual(["ARCE FRANCO", "Nadie"]);
    expect(report.shellNames.reduce((acc, s) => acc + s.rows, 0)).toBe(6);

    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id < 0")[0].c).toBe(0);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c).toBe(0);
    expect(
      rows<{ c: number }>(
        "SELECT COUNT(DISTINCT agent_id) c FROM schedules WHERE lower(trim(agent_name)) = 'arce franco'",
      )[0].c,
    ).toBe(1);
    expect(
      rows<{ c: number }>(
        "SELECT COUNT(DISTINCT agent_id) c FROM schedules WHERE lower(trim(agent_name)) = 'nadie'",
      )[0].c,
    ).toBe(1);
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE lower(trim(name)) = 'arce franco'")[0].c,
    ).toBe(1);
    expect(
      rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE lower(trim(name)) = 'nadie'")[0].c,
    ).toBe(1);
  });

  it("agentes-shell quedan inertes (sin user_id, flags en 0)", async () => {
    await runLinkOrphanSchedules({ dbPath, apply: true });
    const shells = rows<{
      userId: number | null;
      en_cronograma: number;
      asignable_cubic: number;
      incluido_calidad: number;
      asignable_ags: number;
    }>(
      "SELECT user_id AS userId, en_cronograma, asignable_cubic, incluido_calidad, asignable_ags FROM agents WHERE name IN ('Arce Franco','Nadie') ORDER BY name",
    );
    expect(shells.length).toBe(2);
    for (const shell of shells) {
      expect(shell.userId).toBeNull();
      expect(shell.en_cronograma).toBe(0);
      expect(shell.asignable_cubic).toBe(0);
      expect(shell.incluido_calidad).toBe(0);
      expect(shell.asignable_ags).toBe(0);
    }
  });

  it("nombres solo-whitespace se reportan, no se vinculan ni crean shells", async () => {
    exec(
      "INSERT INTO schedules (agent_name, agent_id, date, status) VALUES " +
        "('   ', NULL, '2026-03-01', 'Trabajo')," +
        "(char(9), NULL, '2026-03-02', 'Trabajo')",
    );

    const report = await runLinkOrphanSchedules({ dbPath, apply: true });
    expect(report.orphansUnlinkable.some((m) => m.includes("nombre vacío"))).toBe(true);
    expect(report.orphansUnlinkable.some((m) => m.includes("2 filas"))).toBe(true);
    expect(report.rowsLinked).toBe(3); // solo Arce Franco + Nadie
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE trim(name) = ''")[0].c).toBe(0);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NULL")[0].c).toBe(2);
  });
});
