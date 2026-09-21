// tests/unit/schedule-links.test.ts
import { describe, it, expect } from "vitest";
import {
  buildNameToAgentId,
  resolveAgentIdByName,
  buildUsernameToUserId,
  resolveUserIdByUsername,
} from "../../src/lib/scheduleLinks";

describe("buildNameToAgentId + resolveAgentIdByName", () => {
  const agents = [
    { id: 1, name: "Rojas Ramiro" },
    { id: 2, name: "González Franco" },
    { id: 3, name: "Perez Ana" },
    { id: 4, name: "PEREZ ANA" }, // ambigüedad case-insensitive con id 3
  ];
  const map = buildNameToAgentId(agents);

  it("match exacto", () => {
    expect(resolveAgentIdByName(map, "Rojas Ramiro")).toEqual({
      agentId: 1,
      match: "exact",
    });
  });

  it("match case-insensitive se reporta como tal", () => {
    expect(resolveAgentIdByName(map, "rojas ramiro")).toEqual({
      agentId: 1,
      match: "case-insensitive",
    });
  });

  it("ambiguo (normaliza igual a dos agentes) no asigna", () => {
    expect(resolveAgentIdByName(map, "Perez Ana")).toEqual({
      agentId: 3,
      match: "exact",
    });
    expect(resolveAgentIdByName(map, "perez ana")).toEqual({
      agentId: null,
      match: "ambiguous",
    });
  });

  it("sin match", () => {
    expect(resolveAgentIdByName(map, "Nadie Existe")).toEqual({
      agentId: null,
      match: "none",
    });
  });

  it("nombre vacío/null", () => {
    expect(resolveAgentIdByName(map, "")).toEqual({ agentId: null, match: "none" });
  });
});

describe("buildUsernameToUserId + resolveUserIdByUsername", () => {
  const users = [
    { id: 10, username: "ramrojas" },
    { id: 11, username: "FRNGONZALEZ" },
  ];
  const map = buildUsernameToUserId(users);

  it("match por lower(username)", () => {
    expect(resolveUserIdByUsername(map, "ramrojas")).toBe(10);
    expect(resolveUserIdByUsername(map, "frngonzalez")).toBe(11);
    expect(resolveUserIdByUsername(map, " FRNGONZALEZ ")).toBe(11);
  });

  it("sin match o username vacío → null", () => {
    expect(resolveUserIdByUsername(map, "nadie")).toBeNull();
    expect(resolveUserIdByUsername(map, "")).toBeNull();
    expect(resolveUserIdByUsername(map, null)).toBeNull();
  });
});
