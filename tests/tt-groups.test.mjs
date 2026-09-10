import { describe, it, expect } from "vitest";
import {
  computeTTBase,
  isTTVmHostname,
  groupTTDevices,
  sortTTGroups,
} from "../src/lib/ttGroups";

describe("computeTTBase", () => {
  it("strips -D suffix from VM hostnames", () => {
    expect(computeTTBase("TTBUE02P-D")).toBe("TTBUE02P");
  });

  it("returns physical hostnames unchanged", () => {
    expect(computeTTBase("TTBUE02P")).toBe("TTBUE02P");
  });
});

describe("isTTVmHostname", () => {
  it("detects VM suffix", () => {
    expect(isTTVmHostname("TTBUE02P-D")).toBe(true);
    expect(isTTVmHostname("TTBUE02P")).toBe(false);
  });
});

describe("groupTTDevices", () => {
  const row = (id, hostname, extra = {}) => ({
    id,
    hostname,
    operatingSystem: "Debian GNU/Linux 10 (buster)",
    manufacturer: "Dell Inc.",
    model: "OptiPlex 3060",
    nis: "BUE02",
    ...extra,
  });

  it("groups physical + VM under the same base, physical first", () => {
    const groups = groupTTDevices([
      row(2, "TTBUE02P-D"),
      row(1, "TTBUE02P"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].base).toBe("TTBUE02P");
    expect(groups[0].primaryId).toBe(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual([1, 2]);
    expect(groups[0].pairState).toBe("complete");
  });

  it("marks VM as primary with missing-physical when no physical exists", () => {
    const groups = groupTTDevices([row(3, "TTCOR01P-D")]);
    expect(groups[0].primaryId).toBe(3);
    expect(groups[0].pairState).toBe("missing-physical");
  });

  it("marks physical with missing-vm when no VM exists", () => {
    const groups = groupTTDevices([row(4, "TTROS03P")]);
    expect(groups[0].primaryId).toBe(4);
    expect(groups[0].pairState).toBe("missing-vm");
  });

  it("does not group a Windows physical with its Debian VM (VM stays alone)", () => {
    const groups = groupTTDevices([
      row(5, "TTBUE02P", { operatingSystem: "Windows 10 Pro" }),
      row(6, "TTBUE02P-D"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].pairState).toBe("missing-physical");
  });

  it("sorts groups by base ascending", () => {
    const groups = groupTTDevices([
      row(8, "TTZAR05P"),
      row(7, "TTABA01P"),
    ]);
    expect(groups.map((g) => g.base)).toEqual(["TTABA01P", "TTZAR05P"]);
  });
});

describe("sortTTGroups", () => {
  const mk = (base, os, nis, model) => ({
    base,
    primaryId: 1,
    pairState: "complete",
    rows: [
      {
        id: 1,
        hostname: base,
        operatingSystem: os,
        manufacturer: "Dell Inc.",
        model,
        nis,
      },
    ],
  });

  it("keeps base ASC as default", () => {
    const groups = [mk("TTZAR05P", "a", "1", "x"), mk("TTABA01P", "b", "2", "y")];
    expect(sortTTGroups(groups).map((g) => g.base)).toEqual([
      "TTABA01P",
      "TTZAR05P",
    ]);
  });

  it("sorts by os using the primary row", () => {
    const groups = [
      mk("TTABA01P", "Ubuntu 22.04", "1", "x"),
      mk("TTZAR05P", "Debian 10", "2", "y"),
    ];
    const sorted = sortTTGroups(groups, "os", "asc");
    expect(sorted[0].rows[0].operatingSystem).toBe("Debian 10");
  });

  it("sorts desc with sortOrder desc", () => {
    const groups = [mk("TTABA01P", "a", "1", "x"), mk("TTZAR05P", "b", "2", "y")];
    expect(sortTTGroups(groups, "hostname", "desc").map((g) => g.base)).toEqual([
      "TTZAR05P",
      "TTABA01P",
    ]);
  });
});
