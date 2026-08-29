// tests/unit/navigation/island-effective-path.test.ts
import { describe, it, expect } from "vitest";
import { getIslandEffectivePathname } from "../../../src/lib/navigation";

describe("getIslandEffectivePathname", () => {
  const ISLAND = "/_server-islands/AdminUsersContent";

  it("maps an island path to its parent page using the referer", () => {
    expect(
      getIslandEffectivePathname(ISLAND, "http://localhost:4321/admin/usuarios"),
    ).toBe("/admin/usuarios");
  });

  it("uses referer pathname only (drops query)", () => {
    expect(
      getIslandEffectivePathname(ISLAND, "http://localhost:4321/admin/auditoria?x=1"),
    ).toBe("/admin/auditoria");
  });

  it("returns the island path when there is no referer (stays deny-by-default)", () => {
    expect(getIslandEffectivePathname(ISLAND, null)).toBe(ISLAND);
  });

  it("returns non-island paths unchanged regardless of referer", () => {
    expect(
      getIslandEffectivePathname("/admin/usuarios", "http://localhost:4321/otra"),
    ).toBe("/admin/usuarios");
  });

  it("returns the island path on malformed referer", () => {
    expect(getIslandEffectivePathname(ISLAND, "not-a-url")).toBe(ISLAND);
  });
});
