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

// Un `dist` stale/mismatcheado (build con PM2/Node vivos, node_modules
// inconsistente) deja archivos `_astro/*` sin escribir aunque el server los
// declare. `server.mjs` no tiene guard para `/_astro/*`: el miss cae al SSR y
// responde el HTML 404, así que el browser rechaza el asset por MIME.
//
// Se contrasta la lista autoritativa de assets del manifest de Astro
// (`"assets":[...]`) contra `dist/client`. No se escanean strings `_astro/*`
// sueltos del bundle: contiene entradas de módulos (`?astro&type=script`) que
// no siempre se emiten como archivo y darían falsos positivos.
function listServerFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listServerFiles(full, acc);
    else if (entry.endsWith(".mjs") || entry.endsWith(".json")) acc.push(full);
  }
  return acc;
}

function readManifestAssets() {
  for (const file of listServerFiles("dist/server")) {
    const source = readFileSync(file, "utf8");
    const match = source.match(/"assets":\[([^\]]*)\]/);
    if (match) {
      return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    }
  }
  return null;
}

const declaredAssets = readManifestAssets();
if (!declaredAssets) {
  console.error(
    "[verify-build] ERROR: no se encontro la lista de assets en el manifest del server.",
  );
  process.exit(1);
}

const astroAssets = [
  ...new Set(
    declaredAssets.filter((pathname) => pathname.startsWith("/_astro/")),
  ),
];
if (astroAssets.length === 0) {
  console.error(
    "[verify-build] ERROR: no se encontro la lista de assets del manifest; el chequeo de _astro/* no puede validar nada.",
  );
  process.exit(1);
}
const missingAssets = astroAssets.filter(
  (pathname) => !existsSync(join("dist/client", pathname.slice(1))),
);
if (missingAssets.length > 0) {
  console.error(
    `[verify-build] ERROR: ${missingAssets.length} assets de dist/client faltan (dist stale o build con PM2 vivo).`,
  );
  for (const pathname of missingAssets.slice(0, 10)) {
    console.error(`  - ${pathname}`);
  }
  console.error(
    "Fix: detener servicios, npm ci, rebuild (docs/deploy-produccion.md §Errores comunes).",
  );
  process.exit(1);
}
console.log(
  `[verify-build] OK: ${astroAssets.length} assets de _astro referenciados existen en dist/client`,
);
