// tests/unit/roles-matrix-consistency.test.ts
//
// Anti-drift: `src/lib/rolesMatrix.ts` es una tabla DESCRIPTIVA por rol que se
// renderiza en /admin/usuarios y alimenta `isAllowed` para gating de UI.
// La fuente de verdad de permisos es `src/lib/rbac.ts`
// (`getModulePermissions` + `routePermissions`/`hasPermission`) y, para la capa
// de mesa, `src/lib/helpdeskAccess.ts` (`isSectionVisibleSync`).
//
// Este test compara, para las filas mapeables, cada columna de rol contra la
// matriz real. Si rolesMatrix vuelve a divergir, el test falla.
//
// FILAS FUERA DE LA COMPARACION AUTOMATICA (y por que):
//   - "Métricas Propias": métricas por-usuario del propio perfil; no existe
//     ruta ni módulo equivalente en rbac (no es una capacidad por rol/ruta).
//   - La capa de mesa (`isSectionVisibleSync`) NO se compara aca: rolesMatrix
//     modela solo el rol. Filas como "Ver/Editar Cronogramas", "Gestión de
//     Calidad", "Autogestiones", "Asistencia" o "Ver Inventario" (cubics)
//     además dependen de la mesa (p.ej. solo MDA TI). Eso es por mesa, no por
//     rol, y se prueba en tests/unit/permissions/helpdesk-access.test.ts.
import { describe, expect, it } from "vitest";
import { rolesMatrix, type RoleMatrixFeature } from "@lib/rolesMatrix";
import { CANONICAL_ROLES, getModulePermissions, hasPermission } from "@lib/rbac";

type Role = (typeof CANONICAL_ROLES)[number];

// feature -> predicate against the real matrix (rbac.ts).
const MAPPED: Record<string, (role: string) => boolean> = {
  "Ver Oficinas": (r) => hasPermission("/oficinas", r),
  "Ver Enlaces": (r) => hasPermission("/recursos", r),
  "Ver Títulos": (r) => hasPermission("/titulos", r),
  "Ver Mesas de Ayuda": (r) => hasPermission("/mesas-de-ayuda", r),
  "Ver Inventario": (r) => hasPermission("/inventario-terminales", r),
  "Generar Firmas": (r) => hasPermission("/generador-firmas", r),
  "Ver Cronogramas": (r) => hasPermission("/supervision/cronograma", r),
  "Gestión de Calidad": (r) => getModulePermissions("calidad", r).canWrite,
  Autogestiones: (r) => getModulePermissions("asignacion_ag", r).canWrite,
  "Editar Cronogramas": (r) => getModulePermissions("cronograma", r).canWrite,
  Asistencia: (r) => getModulePermissions("asistencia", r).canRead,
  "Administrar Títulos": (r) => getModulePermissions("titulos", r).canWrite,
  "Administrar Contenido": (r) => hasPermission("/oficinas/create", r),
  "Administrar Usuarios": (r) => getModulePermissions("usuarios", r).canWrite,
  "Logs de Auditoría": (r) => hasPermission("/admin/auditoria", r),
};

const byFeature = new Map(rolesMatrix.map((f) => [f.feature, f]));

describe("rolesMatrix ⇔ rbac (anti-drift)", () => {
  it("cada fila mapeable coincide en TODOS los roles canonicos", () => {
    const mismatches: string[] = [];

    for (const [feature, predicate] of Object.entries(MAPPED)) {
      const row = byFeature.get(feature);
      if (!row) {
        mismatches.push(`falta la fila "${feature}" en rolesMatrix`);
        continue;
      }
      for (const role of CANONICAL_ROLES) {
        const matrixValue = (row as RoleMatrixFeature)[role as Role];
        const realValue = predicate(role);
        if (matrixValue !== realValue) {
          mismatches.push(
            `"${feature}" rol=${role}: rolesMatrix=${matrixValue} rbac=${realValue}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("no hay features duplicadas en rolesMatrix", () => {
    const names = rolesMatrix.map((f) => f.feature);
    expect(new Set(names).size).toBe(names.length);
  });

  it("documenta las filas que quedan fuera de la comparacion automatica", () => {
    // Si se agrega una fila a rolesMatrix y no se mapea ni se justifica,
    // este test obliga a decidir explicitamente.
    const DECLARED_UNMAPPED = new Set(["Métricas Propias"]);
    const unmapped = rolesMatrix
      .map((f) => f.feature)
      .filter((name) => !(name in MAPPED));
    expect(new Set(unmapped)).toEqual(DECLARED_UNMAPPED);
  });
});
