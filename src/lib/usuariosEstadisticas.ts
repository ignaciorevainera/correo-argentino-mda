import { and, eq, sql } from "drizzle-orm";
import { db } from "@db/index";
import { users, agents, mesas } from "@db/schema";
import { CANONICAL_ROLES, isValidRole, normalizeRole } from "@lib/rbac";
import { MDA_TI_HELPDESK } from "@lib/helpdeskAccess";
import { sanitizeError } from "@lib/apiResponse";
import { listMesasAsignables } from "@lib/mesas";

export interface Serie {
  label: string;
  data: number[];
}

export interface ChartData {
  labels: string[];
  series: Serie[];
}

export interface UsuariosEstadisticas {
  kpis: {
    total: number;
    activos: number;
    inactivos: number;
    enAsistencia: number;
  };
  charts: {
    estado: ChartData;
    porRol: ChartData;
    porMesa: ChartData;
  };
  filtros: {
    roles: string[];
    mesas: { id: number; name: string }[];
  };
}

export type LoadResult =
  | { ok: true; data: UsuariosEstadisticas }
  | { ok: false; error: string; internal: boolean };

function parseBool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("booleano inválido");
}

function validationError(error: string): LoadResult {
  return { ok: false, error, internal: false };
}

export async function loadUsuariosEstadisticas(
  rolParam: string | null,
  mesaParam: string | null,
  activoParam: string | null,
): Promise<LoadResult> {
  let activo: boolean | undefined;
  try {
    activo = parseBool(activoParam);
  } catch {
    return validationError(
      "El parámetro 'activo' debe ser 'true' o 'false'",
    );
  }

  if (rolParam !== null) {
    const canonical = rolParam.toLowerCase().replace(/[-_\s]/g, "_");
    if (!isValidRole(canonical)) {
      return validationError("El parámetro 'rol' no es un rol válido");
    }
  }

  if (mesaParam !== null) {
    if (!/^\d+$/.test(mesaParam)) {
      return validationError(
        "El parámetro 'mesa' debe ser un entero positivo",
      );
    }
    const mesaId = Number.parseInt(mesaParam, 10);
    if (mesaId <= 0) {
      return validationError(
        "El parámetro 'mesa' debe ser un entero positivo",
      );
    }
  }

  try {
    const conditions = [];
    if (rolParam !== null) {
      const rol = normalizeRole(rolParam);
      conditions.push(sql`lower(${users.role}) = ${rol.toLowerCase()}`);
    }
    if (mesaParam !== null) {
      conditions.push(eq(users.helpdeskId, Number.parseInt(mesaParam, 10)));
    }
    if (activo !== undefined) {
      conditions.push(eq(users.active, activo));
    }

    const rows = await db
      .select({
        role: users.role,
        active: users.active,
        mesaName: mesas.name,
        mesaActive: mesas.active,
        mesaAssignable: mesas.assignable,
        enAsistencia: agents.enAsistencia,
      })
      .from(users)
      .leftJoin(agents, eq(agents.userId, users.id))
      .leftJoin(mesas, eq(users.helpdeskId, mesas.invgateId))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = rows.length;
    const activos = rows.filter((r) => r.active).length;
    const enAsistencia = rows.filter((r) => r.enAsistencia).length;

    const countBy = (
      pick: (row: (typeof rows)[number]) => string | null,
    ): ChartData => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const key = pick(row);
        if (key === null) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return {
        labels: [...counts.keys()],
        series: [{ label: "Usuarios", data: [...counts.values()] }],
      };
    };

    const mesasDisponibles = await listMesasAsignables();

    return {
      ok: true,
      data: {
        kpis: { total, activos, inactivos: total - activos, enAsistencia },
        charts: {
          estado: {
            labels: ["Activos", "Inactivos"],
            series: [{ label: "Usuarios", data: [activos, total - activos] }],
          },
          porRol: countBy((row) => normalizeRole(row.role)),
          porMesa: countBy((row) =>
            row.mesaActive &&
            (row.mesaAssignable || row.mesaName === MDA_TI_HELPDESK)
              ? row.mesaName
              : null,
          ),
        },
        filtros: {
          roles: [...CANONICAL_ROLES],
          mesas: mesasDisponibles,
        },
      },
    };
  } catch (error) {
    console.error("[usuariosEstadisticas] Error:", error);
    return {
      ok: false,
      error: sanitizeError(error, "Error interno al calcular estadísticas"),
      internal: true,
    };
  }
}
