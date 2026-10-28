import { pruneChangelogFiles, resolveChangelogDir } from "../src/lib/changelog/changelogService.js";

/**
 * Elimina los changelogs fuera de la ventana de retención (3 meses, anclada al release
 * más reciente). Dry-run por defecto: `--apply` para borrar de verdad.
 */
const apply = process.argv.includes("--apply");
const dir = resolveChangelogDir();

const removed = await pruneChangelogFiles(dir, { dryRun: !apply });

if (removed.length === 0) {
  console.log(`✅ Nada que depurar en ${dir}: todos los releases están dentro de los últimos 3 meses.`);
} else if (apply) {
  console.log(`🗑️  ${removed.length} archivo(s) eliminado(s) de ${dir}:`);
  for (const file of removed) console.log(` • ${file}`);
} else {
  console.log(`🔍 Dry-run: ${removed.length} archivo(s) se eliminarían de ${dir}:`);
  for (const file of removed) console.log(` • ${file}`);
  console.log("\nVolvé a correrlo con --apply para borrarlos.");
}
