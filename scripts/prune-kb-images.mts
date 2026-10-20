// GC reversible de imágenes huérfanas de la Base de Conocimiento.
//
// Seguridad:
// - Dry-run por defecto: sin --apply no toca el disco, sólo reporta.
// - --apply MUEVE los huérfanos a una carpeta de cuarentena; nunca borra.
//   Revertir = mover los archivos de vuelta desde --storage/kb-images-quarantine/<stamp>/.
// - Idempotente: re-ejecutar tras --apply no encuentra nada nuevo.
// - Nunca toca filas de kb_articles: el conjunto de referencia incluye TODO el
//   contenido, incl. borradores y archivados.
// - También preserva las imágenes de artículos en papelera no restaurados,
//   porque su contenido sigue en el snapshot de deleted_records.
import "dotenv/config";
import path from "node:path";
import { getStorageRoot } from "../src/lib/storage";
import { runPruneKbImages } from "../src/lib/kbImageGc";

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Falta el valor de ${flag}.`);
    process.exit(1);
  }
  return value;
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const dbPath = path.resolve(
  readFlag(argv, "--db") ?? path.join(process.cwd(), "database", "mda.db"),
);
const storageRoot = path.resolve(readFlag(argv, "--storage") ?? getStorageRoot());

const report = runPruneKbImages({ dbPath, storageRoot, apply });
const prefix = report.dryRun ? "[DRY-RUN] " : "";

console.log(`${prefix}Base de datos: ${dbPath}`);
console.log(`${prefix}Almacenamiento: ${storageRoot}`);
console.log(`${prefix}Mesas: ${report.scannedHelpdesks}`);
console.log(`${prefix}archivos: ${report.scannedFiles}`);
console.log(`${prefix}huérfanos: ${report.orphans.length}`);
for (const { helpdeskId, filename } of report.orphans) {
  console.log(`  ${helpdeskId}/${filename}`);
}
if (report.quarantineDir) {
  console.log(`${prefix}Cuarentena: ${report.quarantineDir}`);
}
if (report.dryRun && report.orphans.length > 0) {
  console.log("Volvé a correr con --apply para mover los huérfanos a cuarentena.");
}
