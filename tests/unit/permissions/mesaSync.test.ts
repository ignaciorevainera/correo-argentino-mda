// tests/unit/permissions/mesaSync.test.ts
import { describe, it, expect, vi } from "vitest";
import { diffMesas, fetchInvGateMesas, syncMesas } from "../../../src/lib/permissions/mesaSync";
import { db } from "../../../src/db";
import { invgateGet } from "../../../src/lib/invgateClient";

vi.mock("../../../src/db", () => ({ db: { select: vi.fn(), transaction: vi.fn() } }));
vi.mock("../../../src/lib/invgateClient", () => ({
  invgateGet: vi.fn(),
}));

describe("diffMesas", () => {
  it("returns added for new invgateIds", () => {
    const result = diffMesas([{ invgateId: 1, name: "A" }], []);
    expect(result.added).toEqual([{ invgateId: 1, name: "A", displayName: null }]);
    expect(result.updated).toEqual([]);
    expect(result.deactivated).toEqual([]);
  });

  it("returns updated for changed names", () => {
    const result = diffMesas(
      [{ invgateId: 1, name: "A v2" }],
      [{ invgateId: 1, name: "A", displayName: null, active: true }],
    );
    expect(result.updated).toEqual([{ invgateId: 1, name: "A v2", displayName: null, wasActive: true }]);
    expect(result.added).toEqual([]);
    expect(result.deactivated).toEqual([]);
  });

  it("returns deactivated for missing invgateIds", () => {
    const result = diffMesas(
      [],
      [{ invgateId: 99, name: "OldQueue", displayName: null, active: true }],
    );
    expect(result.deactivated).toEqual([99]);
  });

  it("does not duplicate invgateIds in added", () => {
    const result = diffMesas(
      [{ invgateId: 1, name: "A" }, { invgateId: 1, name: "A" }],
      [],
    );
    expect(result.added).toHaveLength(1);
  });
});

describe("fetchInvGateMesas error path", () => {
  it("throws when InvGate returns ok:false (no silent wipe)", async () => {
    (invgateGet as any).mockResolvedValue({ ok: false, status: 500, message: "boom" });
    await expect(fetchInvGateMesas()).rejects.toThrow(/InvGate/);
  });

  it("throws when InvGate returns ok:true but no data array", async () => {
    (invgateGet as any).mockResolvedValue({ ok: true, status: 200, data: { foo: "bar" } });
    await expect(fetchInvGateMesas()).rejects.toThrow();
  });
});

describe("syncMesas empty-list guard", () => {
  it("throws and does NOT touch the DB when InvGate returns 0 mesas", async () => {
    (invgateGet as any).mockResolvedValue({ ok: true, status: 200, data: [] });
    (db.select as any).mockResolvedValue([]);
    await expect(syncMesas()).rejects.toThrow(/0 mesas/);
    // Transaction must never be invoked on the empty guard path.
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
