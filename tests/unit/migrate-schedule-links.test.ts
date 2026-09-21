// tests/unit/migrate-schedule-links.test.ts
//
// Integracion del script contra una DB temporal con DDL minimo (mismo enfoque
// que tests/unit/permissions/normalize-participaciones-script.test.ts).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runMigrateScheduleLinks } from "../../scripts/migrate-schedule-links.mts";

const DDL = `
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL);
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
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
  db.prepare("INSERT INTO users (id, username) VALUES (1, 'ramrojas'), (2, 'frngonzalez')").run();
  db.prepare(
    "INSERT INTO agents (id, name, username, user_id) VALUES (1, 'Rojas Ramiro', 'ramrojas', NULL), (2, 'González Franco', 'frngonzalez', NULL), (3, 'Sin Login', NULL, NULL), (4, 'Fantasma', 'nadie_existe', NULL)",
  ).run();
  db.prepare(
    "INSERT INTO schedules (agent_name, agent_id, date, status) VALUES ('Rojas Ramiro', NULL, '2026-01-01', 'Trabajo'), ('rojas ramiro', NULL, '2026-01-02', 'Trabajo'), ('Nadie Existe', NULL, '2026-01-03', 'Trabajo'), ('Sin Login', NULL, '2026-01-04', 'Trabajo')",
  ).run();
  db.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "migrate-links-"));
  dbPath = join(dir, "test.db");
  seed();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rows<T>(sql: string): T[] {
  const db = new Database(dbPath);
  const out = db.prepare(sql).all() as T[];
  db.close();
  return out;
}

describe("runMigrateScheduleLinks", () => {
  it("dry-run no escribe ni crea backup", async () => {
    const report = await runMigrateScheduleLinks({ dbPath, apply: false });
    expect(report.agentsLinked).toBe(2); // ramrojas + frngonzalez
    expect(report.schedulesLinked).toBe(3); // exacto x2 (Rojas + Sin Login) + case-insensitive
    expect(report.schedulesMissing).toContain("Nadie Existe");
    expect(report.agentsNoUser).toContain("Fantasma (nadie_existe)");
    expect(report.agentsNoUsername).toContain("Sin Login");
    expect(report.backupPath).toBeNull();
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules WHERE agent_id IS NOT NULL")[0].c).toBe(0);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents WHERE user_id IS NOT NULL")[0].c).toBe(0);
  });

  it("--apply escribe vínculos y crea backup; segunda corrida es idempotente", async () => {
    const first = await runMigrateScheduleLinks({ dbPath, apply: true });
    expect(first.backupPath).toBeTruthy();
    expect(existsSync(first.backupPath!)).toBe(true);
    expect(rows<{ user_id: number | null }>("SELECT user_id FROM agents WHERE id = 1")[0].user_id).toBe(1);
    expect(rows<{ user_id: number | null }>("SELECT user_id FROM agents WHERE id = 4")[0].user_id).toBeNull();
    expect(rows<{ agent_id: number | null }>("SELECT agent_id FROM schedules WHERE date = '2026-01-01'")[0].agent_id).toBe(1);
    expect(rows<{ agent_id: number | null }>("SELECT agent_id FROM schedules WHERE date = '2026-01-02'")[0].agent_id).toBe(1);
    expect(rows<{ agent_id: number | null }>("SELECT agent_id FROM schedules WHERE date = '2026-01-03'")[0].agent_id).toBeNull();

    const second = await runMigrateScheduleLinks({ dbPath, apply: true });
    expect(second.agentsLinked).toBe(0);
    expect(second.schedulesLinked).toBe(0);
  });

  it("nunca borra filas", async () => {
    await runMigrateScheduleLinks({ dbPath, apply: true });
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM schedules")[0].c).toBe(4);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM agents")[0].c).toBe(4);
    expect(rows<{ c: number }>("SELECT COUNT(*) c FROM users")[0].c).toBe(2);
  });
});
