// tests/unit/permissions/mesaSync.test.ts
import { describe, it, expect, vi } from "vitest";
import { diffMesas } from "../../../src/lib/permissions/mesaSync";

vi.mock("../../../src/db", () => ({ db: { select: vi.fn() } }));
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
});
