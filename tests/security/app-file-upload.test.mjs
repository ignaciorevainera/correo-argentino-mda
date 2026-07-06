import { processAppFileUpload } from '../../src/lib/appFileUpload.ts';
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mda-test-upload-"));
process.env.EXTERNAL_STORAGE_DIR = TMP;

function makeFile(name, content, type) {
  return new File([Buffer.from(content)], name, { type });
}

function exists(name) {
  const appsDir = path.join(TMP, "apps");
  return fs.existsSync(path.join(appsDir, name));
}

function filesIn(dir) {
  try { return fs.readdirSync(path.join(TMP, "apps")); } catch { return []; }
}

// 1. null file → null
assert.equal(await processAppFileUpload(null, null), null, "null file → null");

// 2. File vacío → null
assert.equal(await processAppFileUpload(makeFile("test.zip", "", "application/zip"), null), null, "empty file → null");

// 3. .zip aceptado
const r1 = await processAppFileUpload(makeFile("app.zip", "zipdata", "application/zip"), null);
assert.ok(r1?.endsWith(".zip"), ".zip aceptado");
assert.ok(exists(r1), ".zip escrito a disco");

// 4. .exe con application/octet-stream aceptado (browser fallback)
const r2 = await processAppFileUpload(makeFile("installer.exe", "exedata", "application/octet-stream"), null);
assert.ok(r2?.endsWith(".exe"), ".exe con octet-stream aceptado");

// 5. .msi aceptado
const r3 = await processAppFileUpload(makeFile("setup.msi", "msidata", "application/x-msi"), null);
assert.ok(r3?.endsWith(".msi"), ".msi aceptado");

// 6. .rar aceptado
const r4 = await processAppFileUpload(makeFile("archive.rar", "rardata", "application/vnd.rar"), null);
assert.ok(r4?.endsWith(".rar"), ".rar aceptado");

// 7. .txt rechazado
try {
  await processAppFileUpload(makeFile("readme.txt", "text", "text/plain"), null);
  assert.fail(".txt debe rechazarse");
} catch (e) {
  assert.ok(e.message.includes("extensión"), ".txt → error de extensión");
}

// 8. MIME inválido rechazado
try {
  await processAppFileUpload(makeFile("app.exe", "data", "text/html"), null);
  assert.fail("MIME text/html debe rechazarse");
} catch (e) {
  assert.ok(e.message.includes("tipo de archivo"), "MIME inválido → error de tipo");
}

// 9. Archivo > 100MB rechazado
try {
  const big = new File([Buffer.alloc(101 * 1024 * 1024 + 1)], "big.zip", { type: "application/zip" });
  await processAppFileUpload(big, null);
  assert.fail("Archivo >100MB debe rechazarse");
} catch (e) {
  assert.ok(e.message.includes("100 MB"), ">100MB → error de tamaño");
}

// 10. currentFilePath cleanup: upload reemplaza archivo anterior
filesIn().forEach(f => fs.unlinkSync(path.join(TMP, "apps", f)));
const r5 = await processAppFileUpload(makeFile("v1.zip", "version1", "application/zip"), null);
const r6 = await processAppFileUpload(makeFile("v2.zip", "version2", "application/zip"), r5);
assert.ok(r5 !== r6, "nuevo upload genera distinto filename");
assert.ok(exists(r6), "nuevo archivo existe");
assert.ok(!exists(r5), "archivo anterior eliminado");

// 11. currentFilePath con URLs externas (no cleanup)
const r7 = await processAppFileUpload(makeFile("ext.zip", "external", "application/zip"), "https://cdn.example.com/app.zip");
assert.ok(r7, "currentFilePath URL no rompe upload");

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });
delete process.env.EXTERNAL_STORAGE_DIR;

console.log("All app file upload tests passed!");
