// tests/unit/permissions/cache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { unlinkSync } from "fs";
import { join } from "path";
import {
  loadPermissionsCache,
  invalidatePermissionsCache,
} from "../../../src/lib/permissions/cache";
import { db } from "../../../src/db";

vi.mock("../../../src/db", () => ({
  db: { select: vi.fn() },
}));

// drizzle's db.select().from(x) returns a thenable query builder (awaitable).
// The test mock must mirror that: `.from()` yields a Promise that also exposes
// `.where()` for the filtered `mesas` query.
function makeSelectResult() {
  const p = Promise.resolve([]) as any;
  p.where = () => Promise.resolve([]);
  return p;
}

describe("permissions cache", () => {
  beforeEach(() => {
    invalidatePermissionsCache(true);
  });

  it("dedups concurrent loadPermissionsCache calls", async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: () => makeSelectResult(),
    });
    (db.select as any) = selectMock;

    await Promise.all([
      loadPermissionsCache(true),
      loadPermissionsCache(true),
      loadPermissionsCache(true),
    ]);
    // 5 db.select() calls per load (routes, modules, routeAccess, moduleAccess, mesas)
    expect(selectMock).toHaveBeenCalledTimes(5);
  });

  it("reloads after invalidatePermissionsCache", async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: () => makeSelectResult(),
    });
    (db.select as any) = selectMock;

    await loadPermissionsCache(true);
    expect(selectMock).toHaveBeenCalledTimes(5);

    await invalidatePermissionsCache();
    await loadPermissionsCache(true);
    // before-invalidate (5) + write-through reload inside invalidate (5) + explicit load (5)
    expect(selectMock).toHaveBeenCalledTimes(15);
  });

  it("does not reload within TTL window", async () => {
    // Remove the cross-process invalidation file: beforeEach wrote a
    // real-clock timestamp, and under fake timers Date.now() can start
    // microseconds behind it, spuriously triggering a forced reload.
    try {
      unlinkSync(join(process.cwd(), ".permissions-invalidation-timestamp"));
    } catch {
      // not present — fine
    }
    vi.useFakeTimers();
    const selectMock = vi.fn().mockReturnValue({
      from: () => makeSelectResult(),
    });
    (db.select as any) = selectMock;

    await loadPermissionsCache(true);
    expect(selectMock).toHaveBeenCalledTimes(5);

    vi.advanceTimersByTime(30_000);
    await loadPermissionsCache(false);
    expect(selectMock).toHaveBeenCalledTimes(5);

    vi.useRealTimers();
  });
});
