import { describe, expect, it } from "vitest";
import {
  EMPTY_MONTH_OPTION_HTML,
  currentMonthYM,
  monthOptionLabel,
  monthOptionsHtml,
} from "../../src/components/cronograma/lib/monthLabel";

describe("monthOptionLabel", () => {
  it("marca el mes en curso", () => {
    expect(monthOptionLabel("2026-10", "2026-10")).toBe(
      "OCTUBRE 2026 (mes actual)",
    );
  });

  it("no marca meses distintos al en curso", () => {
    expect(monthOptionLabel("2026-09", "2026-10")).toBe("SEPTIEMBRE 2026");
    expect(monthOptionLabel("2026-10", "2026-11")).toBe("OCTUBRE 2026");
  });

  it("recalcula el marcador según el mes en curso recibido (pestaña longeva)", () => {
    // Mismo mes en la lista: el label cambia cuando cambia el mes en curso,
    // prueba de que el derivador no congela el "mes actual" en carga.
    expect(monthOptionLabel("2026-10", "2026-10")).toContain("(mes actual)");
    expect(monthOptionLabel("2026-10", "2026-11")).not.toContain("(mes actual)");
  });

  it("soporta el cruce de año", () => {
    expect(monthOptionLabel("2027-01", "2026-12")).toBe("ENERO 2027");
  });
});

describe("currentMonthYM", () => {
  it("deriva YYYY-MM con mes a dos dígitos", () => {
    expect(currentMonthYM(new Date(2026, 0, 15))).toBe("2026-01");
    expect(currentMonthYM(new Date(2026, 11, 1))).toBe("2026-12");
  });

  it("currentMonthYM usa fecha local, no UTC", () => {
    // 31/10/2026 23:30 local: en UTC-3 ya es 01/11/2026 UTC. Si el derivador
    // usara toISOString() devolvería "2026-11".
    expect(currentMonthYM(new Date(2026, 9, 31, 23, 30))).toBe("2026-10");
  });
});

describe("monthOptionsHtml", () => {
  it("genera una opción por mes, con el mes actual marcado", () => {
    expect(monthOptionsHtml(["2026-09", "2026-10"], "2026-10")).toBe(
      `<option value="2026-09-01">SEPTIEMBRE 2026</option>` +
        `<option value="2026-10-01">OCTUBRE 2026 (mes actual)</option>`,
    );
  });

  it("con lista vacía devuelve un estado vacío explícito, no una cadena vacía", () => {
    const html = monthOptionsHtml([], "2026-10");
    expect(html).toBe(EMPTY_MONTH_OPTION_HTML);
    expect(html).not.toBe("");
    expect(html).toContain("Sin meses disponibles");
  });
});
