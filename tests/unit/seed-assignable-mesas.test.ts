// tests/unit/seed-assignable-mesas.test.ts
//
// TDD de scripts/seed-assignable-mesas.mts: habilita `mesas.assignable` para
// las mesas historicamente permitidas en el select de alta/edicion de usuario.
// dry-run por defecto, --apply con backup WAL-safe, idempotente, nunca borra.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runSeedAssignableMesas } from "../../scripts/seed-assignable-mesas.mts";
import { ALLOWED_HELPDESK_NAMES } from "../../src/lib/helpdeskAccess";

const MDA_TI = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";

const DDL = `
CREATE TABLE mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invgate_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  assignable INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL
);
`;

const DDL_NO_COLUMN = `
CREATE TABLE mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invgate_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT NOT NULL
);
`;

let dir: string;
let dbPath: string;

function exec(sql: string, path: string = dbPath): void {
  const db = new Database(path);
  db.exec(sql);
  db.close();
}

function rows<T>(sql: string, path: string = dbPath): T[] {
  const db = new Database(path);
  const out = db.prepare(sql).all() as T[];
  db.close();
  return out;
}

function assignableByName(path: string = dbPath): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows<{ name: string; assignable: number }>(
    "SELECT name, assignable FROM mesas",
    path,
  )) {
    out[r.name] = r.assignable;
  }
  return out;
}

function seed(): void {
  exec(`
    INSERT INTO mesas (invgate_id, name, last_synced_at, assignable) VALUES
      (2509, '${MDA_TI}', '2026-01-01', 0),
      (2508, '${COORD}', '2026-01-01', 0),
      (1, 'Otra mesa', '2026-01-01', 0);
  `);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "seed-assignable-"));
  dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  db.exec(DDL);
  db.close();
  seed();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runSeedAssignableMesas", () => {
  it("dry-run: reporta candidatas pero no escribe ni crea backup", async () => {
    const report = await runSeedAssignableMesas({ dbPath, apply: false });

    expect(report.candidates).toEqual([...ALLOWED_HELPDESK_NAMES]);
    expect(report.updated).toBe(2);
    expect(report.missing).toEqual([]);
    expect(report.backupPath).toBeNull();

    expect(assignableByName()).toEqual({
      [MDA_TI]: 0,
      [COORD]: 0,
      "Otra mesa": 0,
    });
  });

  it("apply: habilita solo las mesas permitidas y crea backup WAL-safe", async () => {
    const report = await runSeedAssignableMesas({ dbPath, apply: true });

    expect(report.updated).toBe(2);
    expect(report.backupPath).toBeTruthy();
    expect(existsSync(report.backupPath!)).toBe(true);

    expect(assignableByName()).toEqual({
      [MDA_TI]: 1,
      [COORD]: 1,
      "Otra mesa": 0,
    });
  });

  it("idempotente: segundo apply no actualiza ni crea otro backup", async () => {
    await runSeedAssignableMesas({ dbPath, apply: true });
    const before = readdirSync(dir).filter((f) => f.includes(".bak-seed-assignable-"));
    expect(before).toHaveLength(1);

    const second = await runSeedAssignableMesas({ dbPath, apply: true });

    expect(second.updated).toBe(0);
    expect(second.backupPath).toBeNull();
    const after = readdirSync(dir).filter((f) => f.includes(".bak-seed-assignable-"));
    expect(after).toHaveLength(1);
    expect(assignableByName()[MDA_TI]).toBe(1);
  });

  it("mesa permitida ausente: se reporta en missing y no rompe", async () => {
    exec("DELETE FROM mesas WHERE name = 'Otra mesa'");
    exec(`DELETE FROM mesas WHERE name = '${COORD}'`);

    const report = await runSeedAssignableMesas({ dbPath, apply: true });

    expect(report.updated).toBe(1);
    expect(report.missing).toEqual([COORD]);
    expect(assignableByName()).toEqual({ [MDA_TI]: 1 });
  });

  it("error si la tabla mesas no tiene la columna assignable", async () => {
    const noCol = join(dir, "sin-columna.db");
    const db = new Database(noCol);
    db.exec(DDL_NO_COLUMN);
    db.close();

    await expect(
      runSeedAssignableMesas({ dbPath: noCol, apply: true }),
    ).rejects.toThrow(/no tiene la columna "assignable"/);
  });

  it("error si la DB no existe", async () => {
    await expect(
      runSeedAssignableMesas({ dbPath: join(dir, "no-existe.db"), apply: true }),
    ).rejects.toThrow(/No existe la DB/);
  });
});
