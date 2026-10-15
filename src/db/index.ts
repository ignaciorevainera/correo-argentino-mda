import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = "./database/mda.db";

// `fileMustExist: true` aborta la apertura si falta el archivo, en lugar de
// crear un `mda.db` de 0 bytes que ensucia el diagnostico y revienta despues
// con un error en ingles (#177). El mensaje va en castellano y nombra la ruta
// resuelta para que el operador copie la base desde produccion. Cubre de una
// sola vez a todos los importadores: el servidor, los tests y los scripts.
let sqlite: Database.Database;
try {
  sqlite = new Database(DB_PATH, { fileMustExist: true });
} catch {
  throw new Error(
    `La base de datos en ${path.resolve(process.cwd(), DB_PATH)} no existe. Copiala desde producción antes de correr este script.`,
  );
}

sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
