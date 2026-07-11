import { strict as assert } from "node:assert";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// --- Pure function tests ---

// normalizeFuncion
import { normalizeFuncion, normalizeHostname, readCsvFile, previewImport } from "./stsImport";
;(() => {
  assert.strictEqual(normalizeFuncion("Serv"), "server");
  assert.strictEqual(normalizeFuncion("serv"), "server");
  assert.strictEqual(normalizeFuncion("SERVER"), "server");
  assert.strictEqual(normalizeFuncion("SERV"), "server");
  assert.strictEqual(normalizeFuncion("Imp"), "printer");
  assert.strictEqual(normalizeFuncion("imp"), "printer");
  assert.strictEqual(normalizeFuncion("IMP"), "printer");
  assert.strictEqual(normalizeFuncion("Klie"), "client");
  assert.strictEqual(normalizeFuncion("klie"), "client");
  assert.strictEqual(normalizeFuncion("Corr"), "client");
  assert.strictEqual(normalizeFuncion("Serv/klie9803"), "server");
  assert.strictEqual(normalizeFuncion("unknown"), "client");
  console.log("PASS: normalizeFuncion");
})();

// normalizeHostname
;(() => {
  assert.strictEqual(normalizeHostname(""), null);
  assert.strictEqual(normalizeHostname("   "), null);
  assert.strictEqual(normalizeHostname(null as any), null);
  assert.strictEqual(normalizeHostname("i1262stm001"), "I1262STM001");
  assert.strictEqual(normalizeHostname(" I2185stm001"), "I2185STM001");
  assert.strictEqual(normalizeHostname("C1000ZAAW0107"), "C1000ZAAW0107");
  console.log("PASS: normalizeHostname");
})();

// --- CSV parsing test ---
;(() => {
  const csvContent = [
    "Location;Region;Prov;Func;S;C;I;PC;Imp;Tipo;Hostname;IP;Codigo;Obs",
    "OFICINA A;Metro;C;Serv;S;;;1;1;JP;A0001STM001;10.0.0.1;I0001;",
    "OFICINA A;Metro;C;Imp;;;I;;;JP;;10.0.0.2;I0001;",
    "OFICINA B;Sur;Z;Serv;S;;;1;1;JP;B0002STM001;10.0.1.1;I0002;",
    "OFICINA B;Sur;Z;Klie;;C;;;;JP;B0002STM002;10.0.1.2;I0002;",
    "OFICINA B;Sur;Z;Imp;;;I;;;JP;;10.0.1.3;I0002;",
    "OFICINA C;Norte;X;Serv;S;;;2;1;JP;C0003STM001;10.0.2.1;I0003;some note with ; semicolon",
  ].join("\n");

  const tmpFile = join(tmpdir(), `sts-import-test-${Date.now()}.csv`);
  writeFileSync(tmpFile, csvContent, "latin1");

  const offices = readCsvFile(tmpFile);
  assert.strictEqual(offices.length, 3, "expected 3 offices");

  const a = offices.find(o => o.codigoSts === "I0001")!;
  assert.ok(a);
  assert.strictEqual(a.name, "OFICINA A");
  assert.strictEqual(a.machines.length, 2);

  const b = offices.find(o => o.codigoSts === "I0002")!;
  assert.ok(b);
  assert.strictEqual(b.machines.length, 3);
  assert.strictEqual(b.machines[1].funcion, "Klie");

  const c = offices.find(o => o.codigoSts === "I0003")!;
  assert.ok(c);
  assert.ok(c.machines[0].observaciones.includes("some note"));

  unlinkSync(tmpFile);
  console.log("PASS: readCsvFile");
})();

// --- CSV parsing: encoding (latin1) and edge cases ---
;(() => {
  // Office names with special chars
  const csvContent = [
    "Name;Region;Prov;Func;S;C;I;PC;Imp;Tipo;Hostname;IP;Codigo;Obs",
    "CAÑADA DE GÓMEZ SF;Centro;X;Serv;S;;;1;1;JP;I1234STM001;10.0.0.1;I1234;",
    "9 DE JULIO BA;Metro;B;Serv;S;;;1;1;JP;I5678STM001;10.0.0.2;I5678;",
  ].join("\n");

  const tmpFile = join(tmpdir(), `sts-import-test-encoding-${Date.now()}.csv`);
  writeFileSync(tmpFile, csvContent, "latin1");

  const offices = readCsvFile(tmpFile);
  assert.strictEqual(offices.length, 2);
  assert.strictEqual(offices[0].codigoSts, "I1234");
  assert.strictEqual(offices[1].name, "9 DE JULIO BA");

  unlinkSync(tmpFile);
  console.log("PASS: latin1 encoding + special chars");
})();

// --- Normalize: duplicate codigo STS case ---
;(() => {
  const csvContent = [
    "Name;Region;Prov;Func;S;C;I;PC;Imp;Tipo;Hostname;IP;Codigo;Obs",
    "Ofc A;Metro;C;Serv;S;;;1;1;JP;A001;10.0.0.1;i0001;",
    "Ofc A;Metro;C;Imp;;;I;;;JP;;10.0.0.2;i0001;",
  ].join("\n");

  const tmpFile = join(tmpdir(), `sts-import-test-case-${Date.now()}.csv`);
  writeFileSync(tmpFile, csvContent, "latin1");

  const offices = readCsvFile(tmpFile);
  assert.strictEqual(offices.length, 1, "case-insensitive merge should give 1 office");
  assert.strictEqual(offices[0].codigoSts, "I0001");
  assert.strictEqual(offices[0].machines.length, 2);

  unlinkSync(tmpFile);
  console.log("PASS: case-insensitive codigo STS grouping");
})();

console.log("\nALL TESTS PASSED");
