import { describe, it, expect } from "vitest";
import {
  createSnapshotCache,
  buildTerminalSnapshot,
} from "../src/lib/terminalSnapshot";

describe("createSnapshotCache", () => {
  it("returns the cached value while the signature is unchanged", async () => {
    let loads = 0;
    const cache = createSnapshotCache({
      loadSignature: async () => "sig-1",
      loadSnapshot: async (signature) => {
        loads++;
        return { signature, value: loads };
      },
    });
    const first = await cache.get();
    const second = await cache.get();
    expect(loads).toBe(1);
    expect(first).toBe(second);
  });

  it("reloads when the signature changes", async () => {
    let signature = "sig-1";
    let loads = 0;
    const cache = createSnapshotCache({
      loadSignature: async () => signature,
      loadSnapshot: async (sig) => {
        loads++;
        return { signature: sig, value: loads };
      },
    });
    await cache.get();
    signature = "sig-2";
    const second = await cache.get();
    expect(loads).toBe(2);
    expect(second.signature).toBe("sig-2");
  });

  it("dedupes concurrent loads with the same signature", async () => {
    let loads = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const cache = createSnapshotCache({
      loadSignature: async () => "sig-1",
      loadSnapshot: async (sig) => {
        loads++;
        await gate;
        return { signature: sig, value: loads };
      },
    });
    const p1 = cache.get();
    const p2 = cache.get();
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
  });

  it("propagates errors without caching them", async () => {
    let loads = 0;
    const cache = createSnapshotCache({
      loadSignature: async () => "sig-1",
      loadSnapshot: async () => {
        loads++;
        if (loads === 1) throw new Error("boom");
        return { signature: "sig-1", value: loads };
      },
    });
    await expect(cache.get()).rejects.toThrow("boom");
    const retry = await cache.get();
    expect(retry.value).toBe(2);
  });

  it("clear() forces a reload", async () => {
    let loads = 0;
    const cache = createSnapshotCache({
      loadSignature: async () => "sig-1",
      loadSnapshot: async (sig) => {
        loads++;
        return { signature: sig, value: loads };
      },
    });
    await cache.get();
    cache.clear();
    await cache.get();
    expect(loads).toBe(2);
  });
});

describe("buildTerminalSnapshot", () => {
  const row = (id, extra = {}) => ({
    id,
    hostname: `H${id}`,
    ipAddress: null,
    macAddress: null,
    operatingSystem: null,
    manufacturer: null,
    model: null,
    nis: null,
    lastContact: null,
    ...extra,
  });

  it("indexes rows and detects cluster members", () => {
    const snapshot = buildTerminalSnapshot("sig", [
      row(1, { ipAddress: "10.0.0.1" }),
      row(2, { ipAddress: "10.0.0.1" }),
      row(3, { ipAddress: "10.9.9.9" }),
    ]);
    expect(snapshot.rowsById.size).toBe(3);
    expect(snapshot.allRowIds.has(3)).toBe(true);
    expect([...snapshot.clusterMemberIds].sort()).toEqual([1, 2]);
    expect(snapshot.clusterByRowId.has(3)).toBe(false);
    expect(snapshot.clusters).toHaveLength(1);
  });

  it("returns an empty snapshot for zero rows", () => {
    const snapshot = buildTerminalSnapshot("sig", []);
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.rowsById.size).toBe(0);
    expect(snapshot.allRowIds.size).toBe(0);
    expect(snapshot.clusters).toEqual([]);
    expect(snapshot.clusterMemberIds.size).toBe(0);
  });
});
