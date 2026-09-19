// tests/unit/permissions/normalize-participaciones.test.ts
// Logica pura de normalizacion de participaciones stale por mesa/rol.
// Regla de negocio (espejo de src/pages/admin/usuarios.astro):
//  - mesa no participativa o sin mesa -> los 4 flags a false
//  - supervisor -> enCronograma false (resto segun mesa)
//  - mesa participativa + no supervisor -> sin cambios
import { describe, it, expect } from "vitest";
import {
  normalizeFlags,
  type ParticipationFlags,
} from "../../../scripts/lib/normalizeParticipaciones.mts";

const MDA_TI = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";

const allTrue: ParticipationFlags = {
  enCronograma: true,
  asignableCubic: true,
  incluidoCalidad: true,
  asignableAgs: true,
};

const allFalse: ParticipationFlags = {
  enCronograma: false,
  asignableCubic: false,
  incluidoCalidad: false,
  asignableAgs: false,
};

describe("normalizeFlags", () => {
  it("MDA TI + agent + flags true -> sin cambios", () => {
    expect(normalizeFlags(MDA_TI, "agent", allTrue)).toEqual(allTrue);
  });

  it("MDA TI + supervisor + flags true -> enCronograma false, resto true", () => {
    expect(normalizeFlags(MDA_TI, "supervisor", allTrue)).toEqual({
      enCronograma: false,
      asignableCubic: true,
      incluidoCalidad: true,
      asignableAgs: true,
    });
  });

  it("Coord + agent + flags true -> los 4 false", () => {
    expect(normalizeFlags(COORD, "agent", allTrue)).toEqual(allFalse);
  });

  it("null (sin mesa) + referent + flags true -> los 4 false", () => {
    expect(normalizeFlags(null, "referent", allTrue)).toEqual(allFalse);
  });

  it("idempotencia: aplicar dos veces === aplicar una vez", () => {
    const cases: Array<[string | null, string, ParticipationFlags]> = [
      [MDA_TI, "agent", allTrue],
      [MDA_TI, "supervisor", allTrue],
      [COORD, "agent", allTrue],
      [null, "referent", allTrue],
    ];
    for (const [mesa, role, current] of cases) {
      const once = normalizeFlags(mesa, role, current);
      const twice = normalizeFlags(mesa, role, once);
      expect(twice).toEqual(once);
    }
  });
});
