import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbPath = fileURLToPath(new URL("../database/mda.db", import.meta.url));
if (!existsSync(dbPath)) {
  console.error(`No se encontró la base de datos: ${dbPath}`);
  process.exit(1);
}

const sqlite = new Database(dbPath);

console.log(`Conectado a: ${dbPath}`);

const countStmt = sqlite.prepare(`
  SELECT COUNT(*) as count 
  FROM operator_attendance 
  WHERE horario_estipulado IS NULL 
     OR trim(horario_estipulado) = '' 
     OR trim(horario_estipulado) = 'Franco'
`);

const { count: toUpdate } = countStmt.get() as { count: number };
console.log(`Registros de operator_attendance a normalizar: ${toUpdate}`);

if (toUpdate > 0) {
  const updateStmt = sqlite.prepare(`
    UPDATE operator_attendance 
    SET horario_estipulado = '--:--' 
    WHERE horario_estipulado IS NULL 
       OR trim(horario_estipulado) = '' 
       OR trim(horario_estipulado) = 'Franco'
  `);

  const result = updateStmt.run();
  console.log(`Registros actualizados exitosamente: ${result.changes}`);
} else {
  console.log("No se encontraron registros que requieran normalización.");
}

sqlite.close();
console.log("Proceso finalizado.");
