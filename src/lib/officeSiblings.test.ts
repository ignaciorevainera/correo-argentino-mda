import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSiblingMap, siblingKey } from "./officeSiblings";

type Mini = {
  code: string;
  name: string;
  type: string;
  address: string;
  region: string;
  provinceCode: string;
};

const make = (
  code: string,
  name: string,
  type: string,
  address: string,
  region: string,
  provinceCode: string,
): Mini => ({ code, name, type, address, region, provinceCode });

test("siblingKey normalizes and joins address|region|province", () => {
  assert.equal(siblingKey("  2430 ", "Centro", "s"), "2430|centro|S");
  assert.equal(siblingKey("Calle 2430", "Centro", "S"), "CALLE 2430|centro|S");
});

test("siblingKey returns empty string when address is blank", () => {
  assert.equal(siblingKey("", "Centro", "S"), "");
  assert.equal(siblingKey("   ", "Centro", "S"), "");
});

test("siblingKey treats null address as blank but null region/province keep the key", () => {
  assert.equal(siblingKey(null, "Centro", "S"), "");
  assert.equal(siblingKey("2430", null, null), "2430||");
});

test("buildSiblingMap groups offices sharing address+region+province", () => {
  const items: Mini[] = [
    make("S0000", "Santa Fe", "SUCURSAL_AUTOMATIZADA", "2430", "Centro", "S"),
    make("O7906", "CDD 1 Santa Fe", "CDD", "2430", "Centro", "S"),
    make("I5135", "Tel Santa Fe 1", "TELEGRAFIA", "2430", "Centro", "S"),
    make("X9999", "Otra oficina", "ESTAFETA", "Otra 12", "Centro", "S"),
  ];
  const map = buildSiblingMap(items);
  assert.equal(map.get("S0000")?.length, 2);
  assert.equal(map.get("O7906")?.length, 2);
  assert.equal(map.get("I5135")?.length, 2);
  assert.deepEqual(
    map
      .get("S0000")
      ?.map((s) => s.code)
      .sort(),
    ["I5135", "O7906"],
  );
  assert.deepEqual(
    map
      .get("O7906")
      ?.map((s) => s.type)
      .sort(),
    ["SUCURSAL_AUTOMATIZADA", "TELEGRAFIA"],
  );
  assert.equal(map.has("X9999"), false);
});

test("different province breaks grouping despite identical address", () => {
  const items: Mini[] = [
    make("A1", "A", "CDD", "2430", "Centro", "S"),
    make("B1", "B", "CDD", "2430", "Centro", "B"),
  ];
  const map = buildSiblingMap(items);
  assert.equal(map.size, 0);
});

test("different region breaks grouping despite identical address", () => {
  const items: Mini[] = [
    make("A1", "A", "CDD", "2430", "Centro", "S"),
    make("B1", "B", "CDD", "2430", "Otro", "S"),
  ];
  const map = buildSiblingMap(items);
  assert.equal(map.size, 0);
});

test("buildSiblingMap groups addresses after shared canonicalization", () => {
  const items: Mini[] = [
    make("A1", "Principal", "CDD", "  Av. Santa Fé   101 ", "Centro", "S"),
    make("B1", "Anexo", "CDD", "AV. SANTA FÉ 101", "Centro", "S"),
  ];

  const map = buildSiblingMap(items);

  assert.deepEqual(
    map.get("A1")?.map((office) => office.code),
    ["B1"],
  );
  assert.deepEqual(
    map.get("B1")?.map((office) => office.code),
    ["A1"],
  );
});

test("buildSiblingMap sorts siblings by type then NIS", () => {
  const items: Mini[] = [
    make("S0000", "Santa Fe", "SUCURSAL_AUTOMATIZADA", "2430", "Centro", "S"),
    make("I5135", "Tel 1", "TELEGRAFIA", "2430", "Centro", "S"),
    make("O7906", "CDD 1", "CDD", "2430", "Centro", "S"),
    make("O5005", "Adm", "ADMINISTRACION", "2430", "Centro", "S"),
    make("O6511", "CDP", "CDP", "2430", "Centro", "S"),
  ];
  const map = buildSiblingMap(items);
  assert.deepEqual(
    map.get("S0000")?.map((s) => s.code),
    ["O5005", "O7906", "O6511", "I5135"],
  );
});

test("buildSiblingMap sorts same-type siblings by NIS", () => {
  const items: Mini[] = [
    make("S0000", "Santa Fe", "SUCURSAL_AUTOMATIZADA", "2430", "Centro", "S"),
    make("I2988", "Tel A", "TELEGRAFIA", "2430", "Centro", "S"),
    make("I5135", "Tel B", "TELEGRAFIA", "2430", "Centro", "S"),
  ];
  const map = buildSiblingMap(items);
  assert.deepEqual(
    map.get("I2988")?.map((s) => s.code),
    ["S0000", "I5135"],
  );
});

test("an office with no sibling is omitted from the map", () => {
  const items: Mini[] = [make("SOLO", "Unica", "CDD", "123", "Centro", "S")];
  const map = buildSiblingMap(items);
  assert.equal(map.has("SOLO"), false);
});

test("same address does not cross province or region boundary", () => {
  const map = buildSiblingMap([
    make("A1", "A", "CDD", "AV. SANTA FÉ 101", "Centro", "S"),
    make("B1", "B", "CDD", "av. santa fé 101", "Centro", "B"),
    make("C1", "C", "CDD", "av. santa fé 101", "Sur", "S"),
  ]);

  assert.equal(map.size, 0);
});
