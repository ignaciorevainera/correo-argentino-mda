import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBuildingKey, pickCanonicalAddress } from "./officeBuildingKey";

test("mismo edificio con variaciones de abreviaturas y orden colisiona en la misma clave", () => {
  const a = buildBuildingKey("AV. GDOR V VERGARA 3443");
  const b = buildBuildingKey("VERGARA GOBERNADOR DOCTOR VALENTIN 3443");
  assert.notEqual(a.key, "");
  assert.equal(a.key, b.key);
});

test("extrae el número de puerta y lo usa en la clave", () => {
  const a = buildBuildingKey("AVENIDA SANTA FE 1234");
  const b = buildBuildingKey("SANTA FE 1234");
  assert.equal(a.number, "1234");
  assert.equal(a.key, b.key);
});

test("direcciones de distinto número no colisionan", () => {
  const a = buildBuildingKey("CALLE MITRE 100");
  const b = buildBuildingKey("CALLE MITRE 200");
  assert.notEqual(a.key, b.key);
});

test("misma dirección en provincias distintas no colisiona", () => {
  const a = buildBuildingKey("AV SAN JUAN 1349", "C");
  const b = buildBuildingKey("AV SAN JUAN 1349", "BA");
  assert.notEqual(a.key, b.key);
});

test("misma dirección en la misma provincia colisiona", () => {
  const a = buildBuildingKey("AV SAN JUAN 1349", "C");
  const b = buildBuildingKey("SAN JUAN 1349", "C");
  assert.equal(a.key, b.key);
});

test("dirección nula devuelve clave vacía", () => {
  assert.equal(buildBuildingKey(null).key, "");
  assert.equal(buildBuildingKey("   ").key, "");
});

test("pickCanonicalAddress elige la variante más completa", () => {
  const canonical = pickCanonicalAddress([
    "AV. GDOR V VERGARA 3443",
    "VERGARA GOBERNADOR DOCTOR VALENTIN 3443",
  ]);
  assert.equal(canonical, "VERGARA GOBERNADOR DOCTOR VALENTIN 3443");
});
