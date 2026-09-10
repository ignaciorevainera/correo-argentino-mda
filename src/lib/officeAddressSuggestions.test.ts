import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAddressSuggestions } from "./officeAddressSuggestions";

type Input = {
  code: string;
  name: string;
  address: string;
  provinceCode: string;
  provinceName: string;
  regionName: string;
};

const make = (
  code: string,
  name: string,
  address: string,
  provinceCode: string,
  provinceName: string,
  regionName: string,
): Input => ({ code, name, address, provinceCode, provinceName, regionName });

test("groups by address AND province, offices only carry code and name", () => {
  const result = buildAddressSuggestions(
    [
      make("E0076", "VALLE MARIA", "1 DE MAYO", "E", "Entre Ríos", "Centro"),
      make(
        "O7196",
        "VALLE MARIA CDD",
        "1 DE MAYO",
        "E",
        "Entre Ríos",
        "Centro",
      ),
      make("S8888", "OTRA 1 DE MAYO", "1 DE MAYO", "S", "Santa Fe", "Centro"),
    ],
    "1 DE MAYO",
  );

  assert.equal(result.length, 2);
  const entreRios = result.find((s) => s.provinceCode === "E");
  const santaFe = result.find((s) => s.provinceCode === "S");
  assert.ok(entreRios);
  assert.ok(santaFe);
  assert.deepEqual(entreRios.offices.map((o) => o.code).sort(), [
    "E0076",
    "O7196",
  ]);
  assert.deepEqual(Object.keys(entreRios.offices[0]).sort(), ["code", "name"]);
  assert.equal(entreRios.provinceName, "Entre Ríos");
  assert.equal(entreRios.regionName, "Centro");
  assert.equal(santaFe.offices.length, 1);
  assert.deepEqual(santaFe.offices[0], {
    code: "S8888",
    name: "OTRA 1 DE MAYO",
  });
});

test("sorts prefix matches first, then address, then province name", () => {
  const result = buildAddressSuggestions(
    [
      make("A1", "B", "SANTA FE 100", "S", "Santa Fe", "Centro"),
      make("B1", "B", "SANTA 1", "S", "Santa Fe", "Centro"),
      make("C1", "B", "AV SANTA 50", "B", "Buenos Aires", "Centro"),
    ],
    "SANTA",
  );

  assert.deepEqual(
    result.map((s) => s.address),
    ["SANTA 1", "SANTA FE 100", "AV SANTA 50"],
  );
});

test("returns empty array for empty input", () => {
  assert.deepEqual(buildAddressSuggestions([], "SANTA"), []);
});
