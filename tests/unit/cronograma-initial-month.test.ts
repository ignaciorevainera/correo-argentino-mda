import { describe, expect, it } from "vitest";
import { resolveInitialMonth } from "../../src/components/cronograma/lib/initialMonth";

describe("resolveInitialMonth", () => {
  it("devuelve el mes en curso si existe", () => {
    expect(resolveInitialMonth(["2026-09", "2026-10", "2026-11"], "2026-10")).toBe("2026-10");
  });
  it("sin el mes actual, elige el cargado más cercano hacia atrás", () => {
    expect(resolveInitialMonth(["2026-08", "2026-09", "2026-12"], "2026-10")).toBe("2026-09");
  });
  it("sin meses anteriores, elige el más cercano hacia adelante", () => {
    expect(resolveInitialMonth(["2026-12", "2027-01"], "2026-10")).toBe("2026-12");
  });
  it("con lista vacía, devuelve el mes actual", () => {
    expect(resolveInitialMonth([], "2026-10")).toBe("2026-10");
  });
});
