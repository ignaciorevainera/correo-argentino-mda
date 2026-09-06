// tests/unit/permissions/admin-always-access.test.ts
//
// Politica: el rol admin tiene acceso SIEMPRE a todo, sin importar la mesa
// de ayuda (helpdeskName puede ser null u otra mesa). La visibilidad es
// derivada de src/lib/helpdeskAccess.ts (hardcodeada, fuente unica).
import { describe, it, expect } from "vitest";
import { isSectionVisibleSync } from "../../../src/lib/helpdeskAccess";

describe("admin siempre tiene acceso (politica)", () => {
  it("isSectionVisibleSync permite al admin sin importar la mesa (incluye helpdeskName null)", () => {
    expect(isSectionVisibleSync(null, "admin", "/admin")).toBe(true);
    expect(isSectionVisibleSync(null, "admin", "/admin/usuarios")).toBe(true);
    expect(isSectionVisibleSync(null, "admin", "/supervision/cronograma")).toBe(true);
    expect(
      isSectionVisibleSync("TI_GSM_Mesa de Coord", "admin", "/admin"),
    ).toBe(true);
  });

  it("el gating por mesa sigue aplicando a NO admins (regresion)", () => {
    expect(isSectionVisibleSync(null, "agent", "/admin")).toBe(false);
    expect(
      isSectionVisibleSync("TI_GSM_Mesa de Coord", "agent", "/supervision/cronograma"),
    ).toBe(false);
  });
});
