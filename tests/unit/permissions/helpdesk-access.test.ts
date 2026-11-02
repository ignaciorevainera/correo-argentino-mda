// tests/unit/permissions/helpdesk-access.test.ts
import { describe, it, expect } from "vitest";
import {
  isSectionVisibleSync,
  resolveSessionMesa,
  isSuperiorRole,
  mesaHasParticipaciones,
  PARTICIPATION_HELPDESK_NAMES,
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
} from "../../../src/lib/helpdeskAccess";
import { hasPermission, getModulePermissions } from "../../../src/lib/rbac";
import { can } from "../../../src/lib/roleConfig";

describe("isSectionVisibleSync", () => {
  it("admin ve todo, sin importar la mesa", () => {
    expect(isSectionVisibleSync("TI_GSM_Mesa de Coord", "admin", "/admin/usuarios")).toBe(true);
  });

  it("MDA TI: agent ve cronograma, asistencia solo para roles superiores", () => {
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/cronograma")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/asistencia")).toBe(false);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "supervisor", "/supervision/asistencia")).toBe(true);
  });

  it("MDA TI: autogestiones / AGS oculto para agente, visible para referente, team leader, supervisor y admin", () => {
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/asignacion-autogestiones")).toBe(false);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/autogestiones-metricas")).toBe(false);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/api/disponibilidad")).toBe(false);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/api/autogestion")).toBe(false);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "referent", "/supervision/asignacion-autogestiones")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "referent", "/supervision/autogestiones-metricas")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "referent", "/api/disponibilidad")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "referent", "/api/autogestion")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "team_leader", "/supervision/asignacion-autogestiones")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "supervisor", "/supervision/asignacion-autogestiones")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "admin", "/supervision/asignacion-autogestiones")).toBe(true);
  });

  it("Interacciones de AGS: referente, team leader, supervisor y admin pueden leer, escribir y activar reglas; agente bloqueado", () => {
    const allowedRoles = ["referent", "team_leader", "supervisor", "admin"] as const;

    for (const role of allowedRoles) {
      expect(hasPermission("/supervision/asignacion-autogestiones", role)).toBe(true);
      expect(hasPermission("/supervision/autogestiones-metricas", role)).toBe(true);
      const perm = getModulePermissions("asignacion_ag", role);
      expect(perm.canRead, `${role} canRead`).toBe(true);
      expect(perm.canWrite, `${role} canWrite`).toBe(true);
      expect(can(role, "referent"), `${role} can toggle rules`).toBe(true);
    }

    expect(hasPermission("/supervision/asignacion-autogestiones", "agent")).toBe(false);
    expect(hasPermission("/supervision/autogestiones-metricas", "agent")).toBe(false);
    const agentPerm = getModulePermissions("asignacion_ag", "agent");
    expect(agentPerm.canRead).toBe(false);
    expect(agentPerm.canWrite).toBe(false);
    expect(can("agent", "referent")).toBe(false);
  });

  it("Coord bloqueada de supervisión/admin/cubics y APIs restringidas", () => {
    for (const p of ["/supervision", "/supervision/cronograma", "/admin", "/admin/usuarios", "/inventario-terminales/cubics", "/api/cronograma", "/api/admin"]) {
      expect(isSectionVisibleSync(COORD_HELPDESK, "agent", p), p).toBe(false);
    }
  });

  it("Coord ve páginas comunes y base de conocimiento", () => {
    expect(isSectionVisibleSync(COORD_HELPDESK, "agent", "/titulos")).toBe(true);
    expect(isSectionVisibleSync(COORD_HELPDESK, "agent", "/base-conocimiento")).toBe(true);
  });

  it("normaliza espacios alrededor del nombre de mesa (trim)", () => {
    expect(isSectionVisibleSync(` ${MDA_TI_HELPDESK} `, "agent", "/supervision/cronograma")).toBe(true);
    expect(mesaHasParticipaciones(` ${MDA_TI_HELPDESK} `)).toBe(true);
  });

  it("normaliza espacios internos y slashes múltiples", () => {
    expect(isSectionVisibleSync("TI_GSM_MDA  TI", "agent", "/supervision/cronograma")).toBe(true);
    expect(mesaHasParticipaciones("TI_GSM_MDA  TI")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/cronograma//")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/SUPERVISION/cronograma")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/cronograma/")).toBe(true);
  });

  it("mesa desconocida/null → default restrictivo (como Coord)", () => {
    expect(isSectionVisibleSync(null, "agent", "/supervision/cronograma")).toBe(false);
    expect(isSectionVisibleSync("Mesa Futura", "agent", "/supervision/cronograma")).toBe(false);
    expect(isSectionVisibleSync("Mesa Futura", "agent", "/titulos")).toBe(true);
  });

  it("PARTICIPATION_HELPDESK_NAMES contiene solo MDA TI hoy", () => {
    expect(PARTICIPATION_HELPDESK_NAMES).toEqual([MDA_TI_HELPDESK]);
  });
});

describe("isSuperiorRole", () => {
  it("team_leader y supervisor son superiores; agent/referent/admin no", () => {
    expect(isSuperiorRole("team_leader")).toBe(true);
    expect(isSuperiorRole("supervisor")).toBe(true);
    expect(isSuperiorRole("agent")).toBe(false);
    expect(isSuperiorRole("referent")).toBe(false);
  });
});

describe("resolveSessionMesa", () => {
  const MD = "TI_GSM_MDA TI";

  it("mesa activa con id y nombre → se conserva", () => {
    expect(resolveSessionMesa({ helpdeskId: 500, helpdeskName: MD, mesaActive: true })).toEqual({
      helpdeskId: 500,
      helpdeskName: MD,
    });
  });

  it("mesa inactiva (active=false) → sin mesa", () => {
    expect(resolveSessionMesa({ helpdeskId: 500, helpdeskName: MD, mesaActive: false })).toEqual({
      helpdeskId: null,
      helpdeskName: null,
    });
  });

  it("join vacío (mesa borrada, id null, nombre stale) → sin mesa", () => {
    expect(resolveSessionMesa({ helpdeskId: null, helpdeskName: MD, mesaActive: null })).toEqual({
      helpdeskId: null,
      helpdeskName: null,
    });
  });

  it("nombre vacío o solo espacios → sin mesa", () => {
    expect(resolveSessionMesa({ helpdeskId: 500, helpdeskName: "  ", mesaActive: true })).toEqual({
      helpdeskId: null,
      helpdeskName: null,
    });
  });

  it("mesaActive undefined (join no seleccionado) → sin mesa", () => {
    expect(resolveSessionMesa({ helpdeskId: 500, helpdeskName: MD, mesaActive: undefined })).toEqual({
      helpdeskId: null,
      helpdeskName: null,
    });
  });
});
