// scripts/lib/normalizeParticipaciones.mts
// Logica PURA de decision de participaciones, compartida por el script
// one-time y sus tests. Sin acceso a DB para poder testearla aislada.
//
// Regla de negocio (espejo de src/pages/admin/usuarios.astro):
//  - mesa no participativa o sin mesa (mesaName null) -> los 4 flags a false
//  - supervisor -> enCronograma false (el resto queda segun la mesa)
//  - mesa participativa + no supervisor -> sin cambios
//
// Nota sobre imports: los scripts no resuelven el alias `@lib`, asi que se
// importa por path relativo (convencion del repo, ver scripts/*.ts).
import { mesaHasParticipaciones } from "../../src/lib/helpdeskAccess";

export type ParticipationFlags = {
  enCronograma: boolean;
  asignableCubic: boolean;
  incluidoCalidad: boolean;
  asignableAgs: boolean;
};

export const EMPTY_PARTICIPATION_FLAGS: ParticipationFlags = {
  enCronograma: false,
  asignableCubic: false,
  incluidoCalidad: false,
  asignableAgs: false,
};

/**
 * Devuelve los flags finales para un usuario segun su mesa canonica y rol.
 * Es idempotente: normalizeFlags(normalizeFlags(x)) === normalizeFlags(x).
 */
export function normalizeFlags(
  mesaName: string | null,
  role: string,
  current: ParticipationFlags,
): ParticipationFlags {
  if (!mesaHasParticipaciones(mesaName)) {
    return { ...EMPTY_PARTICIPATION_FLAGS };
  }
  if (role === "supervisor") {
    return { ...current, enCronograma: false };
  }
  return { ...current };
}

export function flagsEqual(a: ParticipationFlags, b: ParticipationFlags): boolean {
  return (
    a.enCronograma === b.enCronograma &&
    a.asignableCubic === b.asignableCubic &&
    a.incluidoCalidad === b.incluidoCalidad &&
    a.asignableAgs === b.asignableAgs
  );
}
