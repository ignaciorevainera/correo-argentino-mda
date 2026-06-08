import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fileUrl = (path) => new URL(path, root);
const read = (path) => readFile(fileUrl(path), "utf8");
const exists = (path) => existsSync(fileUrl(path));

// 1. Check file existence
const filesToExist = [
  "src/components/supervision/cronograma/CronogramaSkeleton.astro",
  "src/components/supervision/cronograma/CronogramaContent.astro",
  "src/components/supervision/asistencia/AsistenciaSkeleton.astro",
  "src/components/supervision/asistencia/AsistenciaContent.astro",
  "src/components/supervision/asistencia/EstadisticasSkeleton.astro",
  "src/components/supervision/asistencia/EstadisticasContent.astro"
];

for (const path of filesToExist) {
  assert.ok(exists(path), `Expected ${path} to exist`);
}

// 2. Check Cronograma Page Defer
const cronogramaPage = await read("src/pages/supervision/cronograma/index.astro");
assert.match(cronogramaPage, /import\s+CronogramaContent\s+from\s+["']@components\/supervision\/cronograma\/CronogramaContent\.astro["']/);
assert.match(cronogramaPage, /import\s+CronogramaSkeleton\s+from\s+["']@components\/supervision\/cronograma\/CronogramaSkeleton\.astro["']/);
assert.match(cronogramaPage, /<CronogramaContent\s+server:defer\s*>/);
assert.match(cronogramaPage, /<CronogramaSkeleton\s+slot=["']fallback["']\s*\/>/);

// 3. Check Asistencia Page Defer
const asistenciaPage = await read("src/pages/supervision/asistencia/index.astro");
assert.match(asistenciaPage, /import\s+AsistenciaContent\s+from\s+["']@components\/supervision\/asistencia\/AsistenciaContent\.astro["']/);
assert.match(asistenciaPage, /import\s+AsistenciaSkeleton\s+from\s+["']@components\/supervision\/asistencia\/AsistenciaSkeleton\.astro["']/);
assert.match(asistenciaPage, /<AsistenciaContent\s+server:defer\s*>/);
assert.match(asistenciaPage, /<AsistenciaSkeleton\s+slot=["']fallback["']\s*\/>/);

// 4. Check Estadisticas Page Defer
const estadisticasPage = await read("src/pages/supervision/asistencia/estadisticas.astro");
assert.match(estadisticasPage, /import\s+EstadisticasContent\s+from\s+["']@components\/supervision\/asistencia\/EstadisticasContent\.astro["']/);
assert.match(estadisticasPage, /import\s+EstadisticasSkeleton\s+from\s+["']@components\/supervision\/asistencia\/EstadisticasSkeleton\.astro["']/);
assert.match(estadisticasPage, /<EstadisticasContent\s+server:defer\s*>/);
assert.match(estadisticasPage, /<EstadisticasSkeleton\s+slot=["']fallback["']\s*\/>/);

console.log("All supervision defer static tests passed successfully!");
