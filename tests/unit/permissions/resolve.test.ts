// tests/unit/permissions/resolve.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasRouteAccess, hasModuleFlag, invalidateRoutesIndex } from "../../../src/lib/permissions/resolve";
import {
  loadPermissionsCache,
  invalidatePermissionsCache,
} from "../../../src/lib/permissions/cache";
import { db } from "../../../src/db";
import { routes, routeAccess, modules, moduleAccess } from "../../../src/db/schema";
import { getTableName } from "drizzle-orm";

vi.mock("../../../src/db", () => ({
  db: { select: vi.fn() },
}));

// drizzle's db.select().from(table) returns a thenable query builder. The mock
// mirrors that: `.from(table)` yields a Promise (also exposing `.where()`) whose
// rows are chosen by the table's name, so cache.ts and resolve.ts get the right
// data depending on which table they query.
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

describe("hasRouteAccess fallback chain", () => {
  it("returns true when no route matches (open by default)", async () => {
    const result = await hasRouteAccess("/some/unknown/path", "agent", null);
    expect(result).toBe(true);
  });

  it("uses hardcoded default when DB has no override", async () => {
    const result = await hasRouteAccess("/admin", "agent", null);
    expect(result).toBe(false);
  });

  it("mesa-specific override beats global override beats default", async () => {
    (db.select as any).mockImplementation(
      makeSelect({
        [getTableName(routes)]: [{ id: 1, path: "/test", label: "Test", sortOrder: 0 }],
        [getTableName(routeAccess)]: [
          { routeId: 1, role: "agent", mesaId: 0, allowed: true },
          { routeId: 1, role: "agent", mesaId: 5, allowed: false },
        ],
      }),
    );
    await invalidatePermissionsCache();
    await loadPermissionsCache(true);

    expect(await hasRouteAccess("/test", "agent", 5)).toBe(false);
    expect(await hasRouteAccess("/test", "agent", 99)).toBe(true);
  });
});

describe("hasModuleFlag fallback chain", () => {
  it("uses hardcoded default when DB has no override", async () => {
    const result = await hasModuleFlag("calidad", "canRead", "agent", null);
    expect(result).toBe(true);
  });

  it("DB override beats default", async () => {
    (db.select as any).mockImplementation(
      makeSelect({
        [getTableName(modules)]: [
          { id: 1, name: "cronograma", label: "Cronograma", flags: [], sortOrder: 0 },
        ],
        [getTableName(moduleAccess)]: [
          {
            moduleId: 1,
            role: "agent",
            mesaId: 0,
            canRead: false,
            canWrite: false,
            canViewAll: true,
            canViewComments: true,
            canViewTotals: true,
          },
        ],
      }),
    );
    await invalidatePermissionsCache();
    await loadPermissionsCache(true);
    expect(await hasModuleFlag("cronograma", "canRead", "agent", null)).toBe(false);
  });
});

describe("global (mesaId 0) override tier", () => {
  it("route global override beats hardcoded default for any mesa", async () => {
    (db.select as any).mockImplementation(
      makeSelect({
        [getTableName(routes)]: [
          { id: 2, path: "/admin", label: "Admin", sortOrder: 0 },
        ],
        [getTableName(routeAccess)]: [
          { routeId: 2, role: "agent", mesaId: 0, allowed: true },
        ],
      }),
    );
    await invalidatePermissionsCache();
    await loadPermissionsCache(true);
    // /admin is hardcoded-denied for agent; global allow=true must win for mesa 5
    expect(await hasRouteAccess("/admin", "agent", 5)).toBe(true);
  });

  it("module global override beats hardcoded default", async () => {
    (db.select as any).mockImplementation(
      makeSelect({
        [getTableName(modules)]: [
          { id: 1, name: "cronograma", label: "Cronograma", flags: [], sortOrder: 0 },
        ],
        [getTableName(moduleAccess)]: [
          {
            moduleId: 1,
            role: "agent",
            mesaId: 0,
            canRead: false,
            canWrite: false,
            canViewAll: true,
            canViewComments: true,
            canViewTotals: true,
          },
        ],
      }),
    );
    await invalidatePermissionsCache();
    await loadPermissionsCache(true);
    // cronograma hardcoded canRead=true for agent; global override false must win for mesa 7
    expect(await hasModuleFlag("cronograma", "canRead", "agent", 7)).toBe(false);
  });
});
