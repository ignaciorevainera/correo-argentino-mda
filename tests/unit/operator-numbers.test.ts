import { describe, expect, it } from "vitest";
import { getOperatorNumber } from "@lib/operatorNumbers";

describe("getOperatorNumber", () => {
  it("resuelve por username, sin importar mayúsculas ni espacios", () => {
    expect(getOperatorNumber("irevainera")).toBe(16);
    expect(getOperatorNumber("  DAALTAMIRANO1 ")).toBe(20);
  });

  it("devuelve undefined para operadores fuera de la lista", () => {
    expect(getOperatorNumber("no-existe")).toBeUndefined();
    expect(getOperatorNumber(null)).toBeUndefined();
    expect(getOperatorNumber(undefined)).toBeUndefined();
  });
});