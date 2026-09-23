// tests/unit/permissions/normalize-participaciones-script.test.ts
//
// Enfoque elegido: DB SQLite temporal en %TEMP% con DDL MINIMO (mesas/users/
// agents). Es menos fragil que correr contra database/mda.db (que puede no
// existir en CI/otra maquina y contiene datos reales) y permite asertar el
// contenido exacto post-apply. No importa src/db/schema.ts ni src/db/index.ts
// para no arrastrar conexion a la DB real (src/db/index.ts abre ./database/mda.db
// al importarse). El DDL minimo cubre solo las columnas que runNormalize usa.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runNormalize } from "../../../scripts/normalize-participaciones.mts";

const DDL = `
  CREATE TABLE mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invgate_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'agent',
    helpdesk_id INTEGER
  );
  CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    user_id INTEGER,
    en_cronograma INTEGER NOT NULL DEFAULT 0,
    asignable_cubic INTEGER NOT NULL DEFAULT 0,
    incluido_calidad INTEGER NOT NULL DEFAULT 0,
    asignable_ags INTEGER NOT NULL DEFAULT 0
  );
`;

const MDA_TI_ID = 500;
const COORD_ID = 501;

let workDir: string;
let dbPath: string;
let users: Record<string, number>;

function seed(): void {
  const db = new Database(dbPath);
  db.exec(DDL);
  db.exec(`
    INSERT INTO mesas (invgate_id, name) VALUES (${MDA_TI_ID}, 'TI_GSM_MDA TI');
    INSERT INTO mesas (invgate_id, name) VALUES (${COORD_ID}, 'TI_GSM_Mesa de Coord');
  `);

  const insertUser = db.prepare(
    "INSERT INTO users (username, role, helpdesk_id) VALUES (?, ?, ?)",
  );
  // Nota: helpdesk_name deliberadamente stale/vacio para probar que se usa la
  // mesa canonica via join y no la denormalizada.
  users = {
    ti_agent: Number(insertUser.run("ti_agent", "agent", MDA_TI_ID).lastInsertRowid),
    ti_sup: Number(insertUser.run("ti_sup", "supervisor", MDA_TI_ID).lastInsertRowid),
    coord_agent: Number(insertUser.run("coord_agent", "agent", COORD_ID).lastInsertRowid),
    nomesa_ref: Number(insertUser.run("nomesa_ref", "referent", null).lastInsertRowid),
    ghost: Number(insertUser.run("ghost", "agent", MDA_TI_ID).lastInsertRowid), // sin agent vinculado
  };

  const insertAgent = db.prepare(
    `INSERT INTO agents (name, user_id, en_cronograma, asignable_cubic, incluido_calidad, asignable_ags)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertAgent.run("TI AGENT", users.ti_agent, 1, 1, 1, 1);
  insertAgent.run("TI SUP", users.ti_sup, 1, 1, 1, 1);
  insertAgent.run("COORD AGENT", users.coord_agent, 1, 1, 1, 1);
  insertAgent.run("NOMESA REF", users.nomesa_ref, 1, 1, 1, 1);
  // Agente huerfano (sin user): no debe tocarse.
  insertAgent.run("ORPHAN", null, 1, 1, 1, 1);

  db.close();
}

function agentFlags(where: string, value: number | string): {
  en: number;
  cubic: number;
  cal: number;
  ags: number;
} {
  const db = new Database(dbPath, { readonly: true });
  const row = db
    .prepare(
      `SELECT en_cronograma en, asignable_cubic cubic, incluido_calidad cal, asignable_ags ags
       FROM agents WHERE ${where}`,
    )
    .get(value) as any;
  db.close();
  return row;
}

function flags(userId: number): ReturnType<typeof agentFlags> {
  return agentFlags("user_id = ?", userId);
}

function flagsByName(name: string): ReturnType<typeof agentFlags> {
  return agentFlags("name = ?", name);
}

function backups(): string[] {
  return readdirSync(workDir).filter((f) => f.includes("bak-normalize-participaciones"));
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "normalize-part-"));
  dbPath = join(workDir, "test.db");
  seed();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("runNormalize — dry-run", () => {
  it("no escribe y reporta los afectados", async () => {
    const report = await runNormalize({ dbPath });
    expect(report.dryRun).toBe(true);
    expect(report.affected).toBe(3); // ti_sup, coord_agent, nomesa_ref
    expect(report.updated).toBe(0);
    expect(report.backupPath).toBeNull();
    expect(backups()).toHaveLength(0);

    // Flags intactos.
    expect(flags(users.ti_sup)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    expect(flags(users.coord_agent)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    expect(flags(users.nomesa_ref)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
  });
});

describe("runNormalize — apply", () => {
  it("escribe solo lo esperado, crea backup y es idempotente", async () => {
    const report = await runNormalize({ dbPath, apply: true });
    expect(report.updated).toBe(3);
    expect(report.backupPath).toBeTruthy();
    expect(existsSync(report.backupPath!)).toBe(true);
    expect(backups()).toHaveLength(1);

    // ti_agent (mesa participativa, agent): sin cambios.
    expect(flags(users.ti_agent)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    // ti_sup: solo enCronograma a false.
    expect(flags(users.ti_sup)).toEqual({ en: 0, cubic: 1, cal: 1, ags: 1 });
    // coord_agent: los 4 a false.
    expect(flags(users.coord_agent)).toEqual({ en: 0, cubic: 0, cal: 0, ags: 0 });
    // nomesa_ref: los 4 a false.
    expect(flags(users.nomesa_ref)).toEqual({ en: 0, cubic: 0, cal: 0, ags: 0 });
    // Agente sin user: intacto.
    expect(flagsByName("ORPHAN")).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });

    // Segunda corrida: sin cambios (idempotente), sin nuevo backup.
    const second = await runNormalize({ dbPath, apply: true });
    expect(second.affected).toBe(0);
    expect(second.updated).toBe(0);
    expect(backups()).toHaveLength(1);
  });

  it("reporta evaluados y usuarios sin agent", async () => {
    const report = await runNormalize({ dbPath });
    expect(report.evaluated).toBe(5); // 5 users
    expect(report.skippedNoAgent).toBe(1); // ghost
  });

  it("link roto (user_id NULL): user cae en skippedNoAgent y su agente no se toca", async () => {
    const before = await runNormalize({ dbPath });
    expect(before.skippedNoAgent).toBe(1); // solo ghost

    // Rompe el vinculo de ti_sup (simula user_id perdido / nunca backfilleado).
    const db = new Database(dbPath);
    db.prepare("UPDATE agents SET user_id = NULL WHERE name = 'TI SUP'").run();
    db.close();

    const report = await runNormalize({ dbPath, apply: true });
    expect(report.skippedNoAgent).toBe(2); // ghost + ti_sup desvinculado
    // ti_sup ya no se evalua: solo coord_agent y nomesa_ref cambian.
    expect(report.affected).toBe(2);
    expect(report.updated).toBe(2);

    // El agente del user desvinculado queda con sus flags stale (intacto).
    expect(flagsByName("TI SUP")).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    expect(flags(users.coord_agent)).toEqual({ en: 0, cubic: 0, cal: 0, ags: 0 });
    expect(flags(users.nomesa_ref)).toEqual({ en: 0, cubic: 0, cal: 0, ags: 0 });
  });

  it("no borra filas", async () => {
    await runNormalize({ dbPath, apply: true });
    const db = new Database(dbPath, { readonly: true });
    const count = (db.prepare("SELECT COUNT(*) c FROM agents").get() as any).c;
    db.close();
    expect(count).toBe(5);
  });
});

describe("runNormalize — error paths", () => {
  it("DB inexistente -> rechaza con error legible, sin crash", async () => {
    const missing = join(workDir, "no-existe.db");
    const err = await runNormalize({ dbPath: missing }).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("No existe la DB");
    expect(err!.message).toContain(missing);
  });

  it("backup falla -> aborta SIN escribir y sin archivo de backup", async () => {
    const failingBackup = async () => {
      throw new Error("disco lleno (simulado)");
    };

    const err = await runNormalize({
      dbPath,
      apply: true,
      backupFn: failingBackup,
    }).then(
      () => null,
      (e: Error) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("No se pudo crear el backup");
    expect(err!.message).toContain("sin cambios");

    // Ningun flag cambio y no quedo backup.
    expect(flags(users.ti_sup)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    expect(flags(users.coord_agent)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    expect(flags(users.nomesa_ref)).toEqual({ en: 1, cubic: 1, cal: 1, ags: 1 });
    expect(backups()).toHaveLength(0);
  });
});
