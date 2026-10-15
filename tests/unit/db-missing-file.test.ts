import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * `src/db/index.ts` abría con `new Database("./database/mda.db")` sin opciones:
 * better-sqlite3 CREA el archivo cuando falta, así que un cwd sin base dejaba un
 * `mda.db` de 0 bytes y el script moría después con `SqliteError: no such table`
 * en inglés (#177). Ahora la apertura usa `fileMustExist: true` y falla en
 * castellano, sin escribir nada.
 *
 * Se prueba por spawning (no importando el módulo) porque lo que importa es el
 * código de salida y el efecto en disco: un test que importara `src/db/index`
 * estaría atado al runner y no vería el archivo creado.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

// Script con `../src/db/index` como primer import: si el módulo tira, el proceso
// muere en la evaluación de imports, antes de tocar la base o la red.
const CONSUMER = "backfill-helpdesk-ids.ts";
const MISSING_DB_MESSAGE = "no existe. Copiala desde producción";

function runScript(script: string, cwd: string, args: string[] = []) {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, path.join(REPO_ROOT, "scripts", script), ...args],
    { cwd, encoding: "utf8", timeout: 60_000 },
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function tempCwd(withDatabaseDir: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-missing-"));
  if (withDatabaseDir) {
    fs.mkdirSync(path.join(dir, "database"), { recursive: true });
  }
  return dir;
}

describe("falta la base en src/db/index (#177)", () => {
  it("un cwd con database/ pero sin mda.db corta en español y no crea el archivo", () => {
    const dir = tempCwd(true);
    try {
      const { status, output } = runScript(CONSUMER, dir);
      expect(status).toBe(1);
      expect(output).toContain(MISSING_DB_MESSAGE);
      expect(fs.existsSync(path.join(dir, "database", "mda.db"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("un cwd sin database/ corta igual y no crea el directorio", () => {
    const dir = tempCwd(false);
    try {
      const { status, output } = runScript(CONSUMER, dir);
      expect(status).toBe(1);
      expect(output).toContain(MISSING_DB_MESSAGE);
      expect(fs.existsSync(path.join(dir, "database"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("reconcile-buildings --help sigue funcionando sin base", () => {
    // La ayuda no debe requerir una base: el import de `src/db/index` en ese
    // script es dinámico, después del `if (args.help)`. Sin esto, el `--help`
    // abortaría en la evaluación del módulo.
    const dir = tempCwd(true);
    try {
      const { status, output } = runScript("reconcile-buildings.ts", dir, [
        "--help",
      ]);
      expect(status).toBe(0);
      expect(output).toContain("Uso: tsx scripts/reconcile-buildings.ts");
      expect(fs.existsSync(path.join(dir, "database", "mda.db"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
