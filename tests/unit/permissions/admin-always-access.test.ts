// tests/unit/permissions/admin-always-access.test.ts
//
// Politica: el rol admin tiene acceso SIEMPRE a todo, sin importar la mesa
// de ayuda (helpdeskName puede ser null u otra mesa) y sin posibilidad de
// revocacion (el rol admin no es editable en la matriz de permisos).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasRouteAccess } from "../../../src/lib/permissions/resolve";
import { isSectionVisible } from "../../../src/lib/helpdeskAccess";
import {
  loadPermissionsCache,
  invalidatePermissionsCache,
} from "../../../src/lib/permissions/cache";
import { invalidateRoutesIndex } from "../../../src/lib/permissions/resolve";
import { db } from "../../../src/db";
import { getTableName } from "drizzle-orm";

vi.mock("../../../src/db", () => ({
  db: { select: vi.fn() },
}));

// Mismo patrón que resolve.test.ts: db.select().from(table) devuelve una
// promesa (con .where) cuya respuesta depende del nombre de la tabla.
function makeSelect(rowsByTable: Record<string, any[]> = {}) {
  return () => ({
    from: (table: any) => {
      const name = table ? getTableName(table) : "";
      const rows = rowsByTable[name] ?? [];
      const p: any = Promise.resolve(rows);
      p.where = () => Promise.resolve(rows);
      return p;
    },
  });
}

beforeEach(async () => {
  invalidatePermissionsCache(true);
  invalidateRoutesIndex();
  (db.select as any).mockImplementation(makeSelect());
  await loadPermissionsCache(true);
});

describe("admin siempre tiene acceso (politica)", () => {
  it("hasRouteAccess permite al admin cualquier ruta conocida o desconocida", async () => {
    expect(await hasRouteAccess("/admin", "admin", null)).toBe(true);
    expect(await hasRouteAccess("/admin/usuarios", "admin", null)).toBe(true);
    expect(await hasRouteAccess("/supervision/cronograma", "admin", null)).toBe(true);
    // Rutas NO whitelisteadas (default-deny para otros roles) siguen abiertas para admin:
    expect(await hasRouteAccess("/alguna/ruta/futura", "admin", null)).toBe(true);
    // Con mesa distinta a MDA TI tambien (mesa null u otra):
    expect(await hasRouteAccess("/admin", "admin", 999)).toBe(true);
  });

  it("isSectionVisible permite al admin sin importar la mesa (incluye helpdeskName null)", async () => {
    expect(await isSectionVisible(null, "admin", "/admin")).toBe(true);
    expect(await isSectionVisible(null, "admin", "/admin/usuarios")).toBe(true);
    expect(await isSectionVisible(null, "admin", "/supervision/cronograma")).toBe(true);
    expect(
      await isSectionVisible("TI_GSM_Mesa de Coord", "admin", "/admin"),
    ).toBe(true);
  });

  it("el gating por mesa sigue aplicando a NO admins (regresion)", async () => {
    expect(await isSectionVisible(null, "agent", "/admin")).toBe(false);
    expect(
      await isSectionVisible("TI_GSM_Mesa de Coord", "agent", "/supervision/cronograma"),
    ).toBe(false);
  });
});
