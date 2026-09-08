import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getOfficeAddressKey,
  normalizeOfficeAddress,
  isSameBuildingConfirmed,
} from "./officeAddress";

test("normaliza uppercase y espacios sin eliminar tildes", () => {
  assert.equal(
    normalizeOfficeAddress("  Av. Santa Fé   101 "),
    "AV. SANTA FÉ 101",
  );
});

test("preserva Ñ, guiones, barras y caracteres especiales", () => {
  assert.equal(
    normalizeOfficeAddress("  Peatonal Ñandú - 12/14 "),
    "PEATONAL ÑANDÚ - 12/14",
  );
});

test("retorna null para valores vacíos", () => {
  assert.equal(normalizeOfficeAddress(null), null);
  assert.equal(normalizeOfficeAddress(undefined), null);
  assert.equal(normalizeOfficeAddress("   "), null);
});

test("normalización es idempotente", () => {
  const value = "AV. SANTA FÉ 101";
  assert.equal(normalizeOfficeAddress(value), value);
  assert.equal(getOfficeAddressKey(value), value);
});

test("clave separada permite agregar equivalencias futuras", () => {
  assert.equal(
    getOfficeAddressKey(" avenida   santa fe 101 "),
    "AVENIDA SANTA FE 101",
  );
});

test("isSameBuildingConfirmed accepts only explicit 'on'", () => {
  assert.equal(isSameBuildingConfirmed("on"), true);
  assert.equal(isSameBuildingConfirmed(null), false);
  assert.equal(isSameBuildingConfirmed(undefined), false);
  assert.equal(isSameBuildingConfirmed("false"), false);
  assert.equal(isSameBuildingConfirmed(""), false);
});
