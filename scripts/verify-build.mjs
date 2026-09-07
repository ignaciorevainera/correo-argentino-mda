import { readFileSync, existsSync } from "node:fs";

const entryPath = process.argv[2] ?? "dist/server/entry.mjs";

if (!existsSync(entryPath)) {
  console.error(`[verify-build] ERROR: ${entryPath} no existe. Ejecutar astro build primero.`);
  process.exit(1);
}

const source = readFileSync(entryPath, "utf8");
const match = source.match(/"rootDir"\s*:\s*"([^"]*)"/);

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