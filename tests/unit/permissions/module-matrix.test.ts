// tests/unit/permissions/module-matrix.test.ts
// Table-driven coverage of the hardcoded module-permission matrix in
// src/lib/rbac.ts getModulePermissions(). Documents the actual defaults
// per module × role (DB overrides fall back to these when module_access
// has no row).
import { describe, it, expect } from "vitest";
import { getModulePermissions } from "../../../src/lib/rbac";

const ROLES = ["agent", "referent", "team_leader", "supervisor", "admin"] as const;
type Role = (typeof ROLES)[number];

interface Expectations {
  canRead: boolean[];
  canWrite: boolean[];
  canViewAll?: boolean[];
  canViewComments?: boolean[];
  canViewTotals?: boolean[];
}

// Order of booleans matches ROLES order.
const MATRIX: Record<string, Expectations> = {
  cronograma: {
    canRead: [true, true, true, true, true],
    canWrite: [false, false, true, true, true],
    canViewAll: [true, true, true, true, true],
    canViewComments: [false, false, true, true, true],
    canViewTotals: [false, false, true, true, true],
  },
  asignacion_ag: {
    canRead: [true, true, true, true, true],
    canWrite: [false, true, true, true, true],
  },
  calidad: {
    canRead: [true, true, true, true, true],
    canWrite: [false, true, true, true, true],
    canViewAll: [false, true, true, true, true],
  },
  asistencia: {
    canRead: [false, false, true, true, true],
    canWrite: [false, false, true, true, true],
  },
  titulos: {
    canRead: [true, true, true, true, true],
    canWrite: [false, false, true, true, true],
  },
  usuarios: {
    canRead: [true, true, true, true, true],
    canWrite: [false, false, false, false, true],
  },
  permisos: {
    canRead: [false, false, false, false, true],
    canWrite: [false, false, false, false, true],
  },
};

describe("module permission matrix (hardcoded defaults)", () => {
  for (const [moduleName, expected] of Object.entries(MATRIX)) {
    describe(moduleName, () => {
      for (const flag of ["canRead", "canWrite", "canViewAll", "canViewComments", "canViewTotals"] as const) {
        const expectedFlags = expected[flag] ?? [true, true, true, true, true];
        ROLES.forEach((role, i) => {
          it(`${flag} for ${role} = ${expectedFlags[i]}`, () => {
            expect(getModulePermissions(moduleName, role)[flag]).toBe(expectedFlags[i]);
          });
        });
      }
    });
  }

  it("unknown module denies read/write, allows view flags", () => {
    for (const role of ROLES) {
      const perm = getModulePermissions("modulo-inexistente", role);
      expect(perm.canRead).toBe(false);
      expect(perm.canWrite).toBe(false);
      expect(perm.canViewAll).toBe(true);
      expect(perm.canViewComments).toBe(true);
      expect(perm.canViewTotals).toBe(true);
    }
  });
});
