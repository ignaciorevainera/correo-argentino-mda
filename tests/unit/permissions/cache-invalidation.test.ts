// tests/unit/permissions/cache-invalidation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadPermissionsCache,
  invalidatePermissionsCache,
  checkCrossProcessInvalidation,
} from "../../../src/lib/permissions/cache";
import { db } from "../../../src/db";
import * as fs from "fs";

vi.mock("../../../src/db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
  };
});

function makeSelectResult() {
  const p = Promise.resolve([]) as any;
  p.where = () => Promise.resolve([]);
  return p;
}

function setupDb() {
  const selectMock = vi.fn().mockReturnValue({
    from: () => makeSelectResult(),
  });
  (db.select as any) = selectMock;
  return selectMock;
}

describe("cross-process cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockReturnValue("0");
    setupDb();
    invalidatePermissionsCache(true);
  });

  it("writes timestamp file on invalidatePermissionsCache", async () => {
    await invalidatePermissionsCache();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".permissions-invalidation-timestamp"),
      expect.any(String),
    );
  });

  it("does not throw when timestamp file write fails", async () => {
    (fs.writeFileSync as any).mockImplementation(() => {
      throw new Error("disk full");
    });
    await expect(invalidatePermissionsCache()).resolves.toBeUndefined();
  });

  it("returns true and resets state when file timestamp is newer than lastLoadedAt", async () => {
    const selectMock = setupDb();
    await loadPermissionsCache(true);
    expect(selectMock).toHaveBeenCalledTimes(5);

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue((Date.now() + 1000).toString());

    expect(checkCrossProcessInvalidation()).toBe(true);

    // State reset: next load fetches from db again
    await loadPermissionsCache(true);
    expect(selectMock).toHaveBeenCalledTimes(10);
  });

  it("returns false when file timestamp is older than lastLoadedAt", async () => {
    await loadPermissionsCache(true);

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue("0");

    expect(checkCrossProcessInvalidation()).toBe(false);
  });

  it("returns false when file does not exist", () => {
    (fs.existsSync as any).mockReturnValue(false);
    expect(checkCrossProcessInvalidation()).toBe(false);
  });

  it("returns false when file read errors", async () => {
    await loadPermissionsCache(true);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockImplementation(() => {
      throw new Error("read error");
    });
    expect(checkCrossProcessInvalidation()).toBe(false);
  });

  it("loadPermissionsCache checks cross-process invalidation before serving cached data", async () => {
    const selectMock = setupDb();
    await loadPermissionsCache(true);
    expect(selectMock).toHaveBeenCalledTimes(5);

    // Within TTL, but other process invalidated: file is newer
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue((Date.now() + 1000).toString());

    await loadPermissionsCache(false);
    expect(selectMock).toHaveBeenCalledTimes(10);
  });

  it("loadPermissionsCache does not reload when no invalidation file", async () => {
    const selectMock = setupDb();
    await loadPermissionsCache(true);
    expect(selectMock).toHaveBeenCalledTimes(5);

    (fs.existsSync as any).mockReturnValue(false);
    await loadPermissionsCache(false);
    expect(selectMock).toHaveBeenCalledTimes(5);
  });

  it("invalidation file with corrupt content does not crash", async () => {
    await loadPermissionsCache(true);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue("not-a-number");
    expect(checkCrossProcessInvalidation()).toBe(false);
  });
});
