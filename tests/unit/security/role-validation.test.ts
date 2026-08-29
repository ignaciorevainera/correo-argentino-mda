import { describe, it, expect } from "vitest";
import { isValidRole, normalizeRole, ROLE_HIERARCHY } from "../../../src/lib/rbac";
import type { Role } from "../../../src/lib/rbac";

describe("isValidRole", () => {
  const canonicalRoles: Role[] = [
    "admin",
    "supervisor",
    "team_leader",
    "referent",
    "agent",
  ];

  it.each(canonicalRoles)("accepts canonical role %s", (role) => {
    expect(isValidRole(role)).toBe(true);
  });

  it("rejects 'Admin' (case-sensitive)", () => {
    expect(isValidRole("Admin")).toBe(false);
  });

  it("rejects 'agent ' (trailing space)", () => {
    expect(isValidRole("agent ")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidRole("")).toBe(false);
  });

  it("rejects 'superadmin'", () => {
    expect(isValidRole("superadmin")).toBe(false);
  });

  it("rejects Spanish variant 'referente'", () => {
    expect(isValidRole("referente")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidRole(undefined as unknown as string)).toBe(false);
    expect(isValidRole(null as unknown as string)).toBe(false);
  });

  it("is a type guard narrowing to Role", () => {
    const input: string = "team_leader";
    if (isValidRole(input)) {
      const narrowed: Role = input;
      expect(ROLE_HIERARCHY[narrowed]).toBe(3);
    } else {
      throw new Error("should narrow");
    }
  });
});

describe("isValidRole vs normalizeRole consistency", () => {
  it("normalizeRole maps every invalid variant, isValidRole only accepts canonical", () => {
    const variants = ["Admin", "REFERENT", "referente", "team-leader", "Team Leader", "agent "];
    for (const v of variants) {
      expect(isValidRole(v)).toBe(false);
      expect(isValidRole(normalizeRole(v))).toBe(true);
    }
  });
});
