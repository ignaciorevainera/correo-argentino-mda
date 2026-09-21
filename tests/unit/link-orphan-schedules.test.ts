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
  username TEXT,
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

describe("runLinkOrphanSchedules", () => {
  it("dry-run no escribe ni crea backup", async () => {
    const report = await runLinkOrphanSchedules({ dbPath, apply: false });
    expect(report.agentsCreated).toBe(2); // Arce Franco + Nadie
    expect(report.rowsLinked).toBe(3);
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
});
