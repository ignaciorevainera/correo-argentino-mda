// tests/unit/permissions/default-deny.test.ts
import { describe, it, expect } from "vitest";
import { hasPermission } from "../../../src/lib/rbac";

// Politica vigente: default-deny para los roles editables. El rol admin es la
// excepcion documentada: siempre tiene acceso a todo y no es revocable (ver
// tests/unit/permissions/admin-always-access.test.ts).
const EDITABLE_ROLES = ["agent", "referent", "team_leader", "supervisor"];

describe("Default-Deny Permissions", () => {
  it("should deny access to unknown routes by default (editable roles)", () => {
    expect(hasPermission("/api/unknown-endpoint", "agent")).toBe(false);
  });

  it("should allow unknown routes to admin (policy exception)", () => {
    expect(hasPermission("/api/unknown-endpoint", "admin")).toBe(true);
  });

  it("should deny access to unlisted routes for editable roles", () => {
    for (const role of EDITABLE_ROLES) {
      expect(hasPermission("/api/new-feature", role)).toBe(false);
      expect(hasPermission("/some/new/page", role)).toBe(false);
    }
  });

  it("should allow access to explicitly whitelisted routes", () => {
    expect(hasPermission("/admin", "admin")).toBe(true);
  });

  it("should deny whitelisted routes for unauthorized roles", () => {
    expect(hasPermission("/admin", "agent")).toBe(false);
  });

  it("should still allow today's page route groups", () => {
    const publicPages = [
      "/",
      "/login",
      "/logout",
      "/profile",
      "/404",
      "/buscador-usuarios",
      "/contactos",
      "/generador-firmas",
      "/inventario-terminales",
      "/mesas-de-ayuda",
      "/oficinas",
      "/recursos",
      "/titulos",
    ];
    for (const role of [...EDITABLE_ROLES, "admin"]) {
      for (const page of publicPages) {
        expect(hasPermission(page, role), `${page} as ${role}`).toBe(true);
      }
    }
  });

  it("should still allow today's API route groups for all roles", () => {
    const apiGroups = [
      "/api/admin",
      "/api/aplicativos",
      "/api/asistencia",
      "/api/cronograma",
      "/api/disponibilidad",
      "/api/download",
      "/api/export",
      "/api/icons",
      "/api/invgate",
      "/api/offices",
      "/api/offices-map-data",
      "/api/soportes",
      "/api/support-guides",
      "/api/terminals",
      "/api/titulos",
      "/api/usuarios",
    ];
    for (const role of [...EDITABLE_ROLES, "admin"]) {
      for (const group of apiGroups) {
        expect(hasPermission(`${group}/x`, role), `${group} as ${role}`).toBe(true);
      }
    }
  });

  it("should preserve restricted subroutes", () => {
    expect(hasPermission("/mesas-de-ayuda/create", "agent")).toBe(false);
    expect(hasPermission("/mesas-de-ayuda/create", "supervisor")).toBe(true);
    expect(hasPermission("/oficinas/edit/1", "agent")).toBe(false);
    expect(hasPermission("/inventario-terminales/cubics/create", "agent")).toBe(false);
    expect(hasPermission("/admin/aplicativos", "team_leader")).toBe(true);
    expect(hasPermission("/supervision/asistencia/estadisticas", "referent")).toBe(false);
    expect(hasPermission("/supervision/cronograma", "agent")).toBe(true);
  });

  it("should normalize empty role to agent and apply normal matching", () => {
    expect(hasPermission("/", "")).toBe(true);
    expect(hasPermission("/api/invgate/ping", "")).toBe(true);
    expect(hasPermission("/admin/aplicativos", "")).toBe(false);
  });
});
