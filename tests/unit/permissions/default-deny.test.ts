// tests/unit/permissions/default-deny.test.ts
import { describe, it, expect } from "vitest";
import { hasPermission } from "../../../src/lib/rbac";

describe("Default-Deny Permissions", () => {
  it("should deny access to unknown routes by default", () => {
    expect(hasPermission("/api/unknown-endpoint", "admin")).toBe(false);
  });

  it("should deny access to unlisted routes for all roles", () => {
    const roles = ["agent", "referent", "team_leader", "supervisor", "admin"];
    for (const role of roles) {
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
    const roles = ["agent", "referent", "team_leader", "supervisor", "admin"];
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
    for (const role of roles) {
      for (const page of publicPages) {
        expect(hasPermission(page, role), `${page} as ${role}`).toBe(true);
      }
    }
  });

  it("should still allow today's API route groups for all roles", () => {
    const roles = ["agent", "referent", "team_leader", "supervisor", "admin"];
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
    for (const role of roles) {
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

  it("should allow unauthenticated users (rank 0) on public routes, matching middleware auth gates", () => {
    expect(hasPermission("/", "")).toBe(true);
    expect(hasPermission("/api/invgate/ping", "")).toBe(true);
  });
});
