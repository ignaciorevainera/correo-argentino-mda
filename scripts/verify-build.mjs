import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entryPath = process.argv[2] ?? "dist/server/entry.mjs";

if (!existsSync(entryPath)) {
  console.error(`[verify-build] ERROR: ${entryPath} no existe. Ejecutar astro build primero.`);
  process.exit(1);
}

let source = readFileSync(entryPath, "utf8");
let match = source.match(/"rootDir"\s*:\s*"([^"]*)"/);

// entry.mjs puede ser un stub que re-exporta desde chunks/server_xxx.mjs
if (!match) {
  const reExportMatch = source.match(/from\s+['"]([^'"]+)['"]/);
  if (reExportMatch) {
    const chunkPath = resolve(dirname(entryPath), reExportMatch[1]);
    if (existsSync(chunkPath)) {
      source = readFileSync(chunkPath, "utf8");
      match = source.match(/"rootDir"\s*:\s*"([^"]*)"/);
    }
  }
}

if (!match || !match[1].trim()) {
  console.error(`[verify-build] ERROR: manifest SSR sin \`rootDir\` valido en ${entryPath}.`);
  console.error("Causa probable: node_modules inconsistente (npm install con PM2/Node vivos).");
  console.error("Fix: detener servicios, borrar node_modules, npm ci, rebuild (docs/lessons.md).");
  process.exit(1);
}

if (!match[1].startsWith("file://")) {
  console.error(`[verify-build] ERROR: rootDir inesperado en ${entryPath}: ${match[1]}`);
  process.exit(1);
}

console.log(`[verify-build] OK: rootDir = ${match[1]}`);