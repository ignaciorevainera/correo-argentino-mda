import {
  and,
  count,
  desc,
  eq,
  inArray,
  like,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { automationParents } from "@/db/schema";
import { ACTIVE_STATUS_IDS, isActiveStatus } from "./automation-status";
import { listClosures } from "./closures";
import type { AutomationClosure } from "./closures";
import type { AutomationSummary } from "./discovery";
import { normalizeForCompare } from "./labels";
import { nowSeconds } from "./time";

/**
 * Historial persistente de padres de automatización. Alimenta el listado
 * completo de la vista de automatizaciones (creados y finalizados), a
 * diferencia de `automation_tracked_parents` que solo mantiene activos.
 *
 * Se puebla como side-effect del scan de discovery y nunca poda filas.
 */

export type AutomationParentRecord = typeof automationParents.$inferSelect;

/**
 * Inserta/actualiza los padres vistos en un scan. `firstSeenAt` solo se fija
 * al insertar; el resto de los campos se refresca en cada corrida.
 */
export function upsertAutomationParents(
  items: readonly AutomationSummary[],
): void {
  if (items.length === 0) {
    return;
  }

  const now = nowSeconds();

  try {
    db.transaction((tx) => {
      for (const item of items) {
        tx.insert(automationParents)
          .values({
            automationId: item.id,
            prettyId: item.prettyId,
            displayName: item.displayName,
            branchCode: item.branchCode,
            branchName: item.branchName,
            statusId: item.statusId,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            closedAt: item.closedAt,
            firstSeenAt: now,
            lastSeenAt: now,
          })
          .onConflictDoUpdate({
            target: automationParents.automationId,
            set: {
              prettyId: item.prettyId,
              displayName: item.displayName,
              branchCode: item.branchCode,
              branchName: item.branchName,
              statusId: item.statusId,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              closedAt: item.closedAt,
              lastSeenAt: now,
            },
          })
          .run();
      }
    });
  } catch {
    return;
  }
}

function toSummary(
  row: AutomationParentRecord,
  closure: AutomationClosure | undefined,
): AutomationSummary {
  if (closure) {
    return {
      id: row.automationId,
      prettyId: row.prettyId,
      branchCode: row.branchCode,
      branchName: row.branchName,
      displayName: row.displayName,
      statusId: row.statusId,
      isActive: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: closure.closedAt,
      localClosure: closure,
    };
  }

  return {
    id: row.automationId,
    prettyId: row.prettyId,
    branchCode: row.branchCode,
    branchName: row.branchName,
    displayName: row.displayName,
    statusId: row.statusId,
    isActive: isActiveStatus(row.statusId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

export type AutomationParentStatusFilter = "all" | "active" | "finalized";

export interface AutomationParentsQuery {
  page?: number;
  pageSize?: number;
  /** Término de búsqueda por NIS, prettyId, sucursal o título. */
  q?: string;
  status?: AutomationParentStatusFilter;
}

export interface AutomationParentsPage {
  items: AutomationSummary[];
  /** Total de filas que matchean la búsqueda/filtro (para paginar). */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const AUTOMATION_PARENTS_PAGE_SIZE = 20;

/** Acentos/ñ que se aplanan en SQLite para búsquedas insensibles a tildes. */
const SEARCH_ACCENTS: readonly (readonly [string, string])[] = [
  ["á", "a"],
  ["é", "e"],
  ["í", "i"],
  ["ó", "o"],
  ["ú", "u"],
  ["ü", "u"],
  ["ñ", "n"],
  ["Á", "A"],
  ["É", "E"],
  ["Í", "I"],
  ["Ó", "O"],
  ["Ú", "U"],
  ["Ü", "U"],
  ["Ñ", "N"],
];

/**
 * Expresión de columna normalizada para búsqueda: aplana acentos/ñ y baja a
 * minúsculas en SQL (SQLite no es accent-insensitive y su `lower()` solo cubre
 * ASCII). El término se normaliza con `normalizeForCompare` para que ambos
 * lados coincidan ("guillon" → "Guillón").
 */
function normalizedSearchColumn(column: AnySQLiteColumn): SQL {
  let expr: SQL = sql`${column}`;
  for (const [from, to] of SEARCH_ACCENTS) {
    expr = sql`replace(${expr}, ${from}, ${to})`;
  }
  return sql`lower(${expr})`;
}

function buildParentsWhere(
  q: string,
  status: AutomationParentStatusFilter,
  closureIds: readonly number[],
) {
  const conditions: (SQL | undefined)[] = [];
  const term = q.trim();

  if (term) {
    const pattern = `%${normalizeForCompare(term)}%`;
    conditions.push(
      or(
        like(normalizedSearchColumn(automationParents.branchCode), pattern),
        like(normalizedSearchColumn(automationParents.prettyId), pattern),
        like(normalizedSearchColumn(automationParents.branchName), pattern),
        like(normalizedSearchColumn(automationParents.displayName), pattern),
      ),
    );
  }

  if (status === "active") {
    conditions.push(
      inArray(automationParents.statusId, [...ACTIVE_STATUS_IDS]),
    );
    if (closureIds.length > 0) {
      conditions.push(
        notInArray(automationParents.automationId, [...closureIds]),
      );
    }
  } else if (status === "finalized") {
    // Finalizada = estado finalizado en InvGate o cierre local en el portal.
    const finalized = [
      notInArray(automationParents.statusId, [...ACTIVE_STATUS_IDS]),
      ...(closureIds.length > 0
        ? [inArray(automationParents.automationId, [...closureIds])]
        : []),
    ];
    conditions.push(or(...finalized));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Página de padres para el listado "Todas las automatizaciones". La búsqueda y
 * el filtro de estado corren en SQL para que la paginación sea correcta sobre
 * todo el historial (no solo la página visible).
 */
export function listAutomationParentsPage(
  query: AutomationParentsQuery = {},
): AutomationParentsPage {
  const pageSize =
    query.pageSize && query.pageSize > 0
      ? Math.floor(query.pageSize)
      : AUTOMATION_PARENTS_PAGE_SIZE;
  const status = query.status ?? "all";

  try {
    const closures = listClosures();
    const where = buildParentsWhere(query.q ?? "", status, [
      ...closures.keys(),
    ]);

    const total = db
      .select({ value: count() })
      .from(automationParents)
      .where(where)
      .get()?.value ?? 0;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(
      Math.max(1, Math.floor(query.page ?? 1) || 1),
      totalPages,
    );

    const rows = db
      .select()
      .from(automationParents)
      .where(where)
      .orderBy(
        desc(automationParents.createdAt),
        desc(automationParents.automationId),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    return {
      items: rows.map((row) => toSummary(row, closures.get(row.automationId))),
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch {
    return { items: [], total: 0, page: 1, pageSize, totalPages: 1 };
  }
}

/** Padres más recientes por actualización (destacada + "Actualizadas recientemente"). */
export function listRecentAutomationParents(limit = 4): AutomationSummary[] {
  if (limit <= 0) {
    return [];
  }
  try {
    const closures = listClosures();
    const rows = db
      .select()
      .from(automationParents)
      .orderBy(
        desc(automationParents.updatedAt),
        desc(automationParents.createdAt),
      )
      .limit(limit)
      .all();
    return rows.map((row) => toSummary(row, closures.get(row.automationId)));
  } catch {
    return [];
  }
}

/**
 * Actualiza el estado mutable de un padre ya visto, sin alterar `firstSeenAt`.
 * Lo usa el progreso liviano (apertura de card) para reflejar en el listado los
 * cambios hechos directamente en InvGate.
 */
export function upsertAutomationParentStatus(
  automationId: number,
  status: { statusId: number; updatedAt: number; closedAt: number | null },
): void {
  try {
    db.update(automationParents)
      .set({
        statusId: status.statusId,
        updatedAt: status.updatedAt,
        closedAt: status.closedAt,
        lastSeenAt: nowSeconds(),
      })
      .where(eq(automationParents.automationId, automationId))
      .run();
  } catch {
    return;
  }
}
