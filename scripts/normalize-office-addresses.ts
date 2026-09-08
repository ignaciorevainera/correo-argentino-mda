import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { normalizeOfficeAddress } from "../src/lib/officeAddress";

type OfficeRow = { id: number; code: string; address: string | null };

const dryRun = process.argv.includes("--dry-run");
const dbPath = fileURLToPath(new URL("../database/mda.db", import.meta.url));
if (!existsSync(dbPath)) {
  console.error(`No se encontró la base de datos: ${dbPath}`);
  process.exit(1);
}
const sqlite = new Database(dbPath);
const rows = sqlite
  .prepare(
    "SELECT id, code, address FROM offices WHERE address IS NOT NULL AND trim(address) != ''",
  )
  .all() as OfficeRow[];
const changes = rows.flatMap((row) => {
  const normalized = normalizeOfficeAddress(row.address);
  return normalized && normalized !== row.address
    ? [{ ...row, normalized }]
    : [];
});

console.log(`Oficinas revisadas: ${rows.length}`);
console.log(`Domicilios a normalizar: ${changes.length}`);
for (const change of changes) {
  console.log(
    `${change.code}: ${JSON.stringify(change.address)} => ${JSON.stringify(change.normalized)}`,
  );
}

if (dryRun || changes.length === 0) {
  sqlite.close();
  process.exit(0);
}

const rl = createInterface({ input, output });
const answer = await rl.question(
  "Escribí NORMALIZAR para actualizar domicilios: ",
);
rl.close();
if (answer !== "NORMALIZAR") {
  console.log("Sin cambios.");
  sqlite.close();
  process.exit(0);
}

const update = sqlite.prepare("UPDATE offices SET address = ? WHERE id = ?");
const updateAll = sqlite.transaction(() => {
  for (const change of changes) update.run(change.normalized, change.id);
});
updateAll();
sqlite.close();
console.log(`Domicilios actualizados: ${changes.length}`);
