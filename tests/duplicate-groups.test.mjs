import { describe, it, expect } from "vitest";
import {
  normalizeDuplicateKey,
  buildDuplicateClusters,
  selectActiveMember,
} from "../src/lib/duplicateGroups";

const row = (id, { ip = null, mac = null, hostname = null } = {}) => ({
  id,
  ip,
  mac,
  hostname,
});

describe("normalizeDuplicateKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeDuplicateKey("  08:00:27:AA:BB:CC ")).toBe(
      "08:00:27:aa:bb:cc",
    );
    expect(normalizeDuplicateKey(" HOST01 ")).toBe("host01");
  });

  it("returns empty for blank/null", () => {
    expect(normalizeDuplicateKey(null)).toBe("");
    expect(normalizeDuplicateKey(undefined)).toBe("");
    expect(normalizeDuplicateKey("   ")).toBe("");
  });
});

describe("buildDuplicateClusters", () => {
  it("groups rows sharing the same IP", () => {
    const clusters = buildDuplicateClusters([
      row(1, { ip: "10.0.0.1", hostname: "A" }),
      row(2, { ip: "10.0.0.1", hostname: "B" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.slice().sort()).toEqual([1, 2]);
    expect(clusters[0].sharedIps).toEqual(["10.0.0.1"]);
  });

  it("groups rows sharing the same MAC case-insensitively", () => {
    const clusters = buildDuplicateClusters([
      row(1, { mac: "AA:BB:CC:DD:EE:FF" }),
      row(2, { mac: " aa:bb:cc:dd:ee:ff " }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.slice().sort()).toEqual([1, 2]);
    expect(clusters[0].sharedMacs).toHaveLength(1);
  });

  it("groups rows sharing the same hostname case-insensitively", () => {
    const clusters = buildDuplicateClusters([
      row(1, { hostname: "HOST01" }),
      row(2, { hostname: " host01 " }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.slice().sort()).toEqual([1, 2]);
    expect(clusters[0].sharedHostnames).toHaveLength(1);
  });

  it("chains different keys into one cluster (IP then MAC then hostname)", () => {
    const clusters = buildDuplicateClusters([
      row(1, { ip: "10.0.0.1" }),
      row(2, { ip: "10.0.0.1", mac: "AA:BB" }),
      row(3, { mac: "AA:BB", hostname: "H" }),
      row(4, { hostname: "H" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.slice().sort()).toEqual([1, 2, 3, 4]);
  });

  it("returns no cluster for unique values", () => {
    expect(
      buildDuplicateClusters([
        row(1, { ip: "1.1.1.1" }),
        row(2, { ip: "2.2.2.2" }),
      ]),
    ).toEqual([]);
  });

  it("ignores blank or null keys", () => {
    expect(
      buildDuplicateClusters([
        row(1, {}),
        row(2, { ip: "" }),
        row(3, { mac: "   " }),
      ]),
    ).toEqual([]);
  });

  it("does not collide equal strings across different fields", () => {
    const clusters = buildDuplicateClusters([
      row(1, { ip: "same" }),
      row(2, { hostname: "same" }),
    ]);
    expect(clusters).toEqual([]);
  });
});

describe("selectActiveMember", () => {
  const now = new Date("2026-09-10T12:00:00").getTime();

  it("picks the most recent lastContact", () => {
    const res = selectActiveMember(
      [
        { id: 1, lastContactRaw: "2026-09-01 10:00:00" },
        { id: 2, lastContactRaw: "2026-09-10 10:00:00" },
      ],
      now,
    );
    expect(res.activeId).toBe(2);
    expect(res.isActiveWithinLast24h).toBe(true);
  });

  it("treats invalid dates as oldest", () => {
    const res = selectActiveMember(
      [
        { id: 1, lastContactRaw: "" },
        { id: 2, lastContactRaw: "2026-08-01 10:00:00" },
      ],
      now,
    );
    expect(res.activeId).toBe(2);
    expect(res.isActiveWithinLast24h).toBe(false);
  });

  it("returns null for empty rows", () => {
    expect(selectActiveMember([], now)).toEqual({
      activeId: null,
      isActiveWithinLast24h: false,
    });
  });

  it("marks active within 24h at the boundary", () => {
    const res = selectActiveMember(
      [{ id: 1, lastContactRaw: "2026-09-09 12:00:01" }],
      now,
    );
    expect(res.isActiveWithinLast24h).toBe(true);
  });
});
