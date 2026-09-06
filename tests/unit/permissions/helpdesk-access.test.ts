// tests/unit/permissions/helpdesk-access.test.ts
import { describe, it, expect } from "vitest";
import {
  isSectionVisibleSync,
  isSuperiorRole,
  mesaHasParticipaciones,
  PARTICIPATION_HELPDESK_NAMES,
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
} from "../../../src/lib/helpdeskAccess";

describe("isSectionVisibleSync", () => {
  it("admin ve todo, sin importar la mesa", () => {
    expect(isSectionVisibleSync("TI_GSM_Mesa de Coord", "admin", "/admin/usuarios")).toBe(true);
  });

  it("MDA TI: agent ve cronograma, asistencia solo para roles superiores", () => {
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/cronograma")).toBe(true);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "agent", "/supervision/asistencia")).toBe(false);
    expect(isSectionVisibleSync(MDA_TI_HELPDESK, "supervisor", "/supervision/asistencia")).toBe(true);
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
