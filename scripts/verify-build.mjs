import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function findRootDirInDir(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      const res = findRootDirInDir(fullPath);
      if (res) return res;
    } else if (file.endsWith(".mjs")) {
      const source = readFileSync(fullPath, "utf8");
      const match = source.match(/"rootDir"\s*:\s*"([^"]*)"/);
      if (match && match[1].trim()) {
        return { path: fullPath, rootDir: match[1] };
      }
    }
  }
  return null;
}

const targetPath = process.argv[2] ?? "dist/server";
const isFile = existsSync(targetPath) && !statSync(targetPath).isDirectory();

let res = null;
if (isFile) {
  const source = readFileSync(targetPath, "utf8");
  const match = source.match(/"rootDir"\s*:\s*"([^"]*)"/);
  if (match && match[1].trim()) {
    res = { path: targetPath, rootDir: match[1] };
  }
}

if (!res) {
  res = findRootDirInDir("dist/server");
}

if (!res) {
  console.error(`[verify-build] ERROR: manifest SSR sin \`rootDir\` valido en ${targetPath}.`);
  console.error("Causa probable: node_modules inconsistente (npm install con PM2/Node vivos).");
  console.error("Fix: detener servicios, borrar node_modules, npm ci, rebuild (docs/lessons.md).");
  process.exit(1);
}

if (!res.rootDir.startsWith("file://")) {
  console.error(`[verify-build] ERROR: rootDir inesperado en ${res.path}: ${res.rootDir}`);
  process.exit(1);
}

console.log(`[verify-build] OK: rootDir = ${res.rootDir}`);