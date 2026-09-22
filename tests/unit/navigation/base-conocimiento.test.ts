// tests/unit/navigation/base-conocimiento.test.ts
import { describe, it, expect } from "vitest";
import { navSections } from "../../../src/lib/navigation";
import { routePermissions } from "../../../src/lib/rbac";
import {
  isSectionVisibleSync,
  COORD_HELPDESK,
} from "../../../src/lib/helpdeskAccess";

describe("sección Base de conocimiento", () => {
  it("está oculta de navSections (se retomará cuando haya artículos)", () => {
    const section = navSections.find((s) => s.id === "base-conocimiento");
    expect(section).toBeUndefined();
    const hrefs = navSections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).not.toContain("/base-conocimiento");
  });

  it("/base-conocimiento está whitelisteada para todos los roles (default-deny)", () => {
    const route = routePermissions.find((r) => r.path === "/base-conocimiento");
    expect(route).toBeDefined();
    expect(route!.roles).toContain("agent");
    expect(route!.roles).toContain("supervisor");
  });

  it("visible para mesa de Coordinación (no está en la blocklist)", () => {
    // isSectionVisibleSync es la fuente de verdad de visibilidad por mesa.
    expect(
      isSectionVisibleSync(COORD_HELPDESK, "agent", "/base-conocimiento"),
    ).toBe(true);
  });
});
