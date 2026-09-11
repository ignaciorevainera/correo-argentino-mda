import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@db/index";
import {
  agents,
  contacts,
  cubicAssignments,
  cubics,
  deletedRecords,
  officeAssets,
  officeContacts,
  officeInvgateLinks,
  offices,
} from "@db/schema";
import { logAdminAction } from "@lib/auditLogger";

export interface DeletedPayload {
  row: Record<string, unknown>;
  children?: Record<string, Record<string, unknown>[]>;
}

export interface SnapshotInput {
  entity: string;
  recordId: string | number;
  label: string;
  payload: DeletedPayload;
  deletedBy: string;
}

/** Inserta un snapshot en la papelera. */
export async function insertDeletedRecord(
  input: SnapshotInput,
): Promise<number> {
  const [rec] = await db
    .insert(deletedRecords)
    .values({
      entity: input.entity,
      recordId: String(input.recordId),
      label: input.label,
      payload: input.payload as any,
      deletedBy: input.deletedBy,
      deletedAt: new Date().toISOString(),
    })
    .returning({ id: deletedRecords.id });
  return rec.id;
}

/** Hijo a capturar: key = clave dentro de payload.children. */
export interface SnapshotChildSpec {
  key: string;
  table: any; // tabla drizzle
  fkColumn: any; // columna FK hacia el padre (para el SELECT)
  fkProperty: string; // nombre de la propiedad JS en la fila (para remap al restaurar)
}

export interface DeleteWithSnapshotOptions {
  entity: string;
  recordId: number | string;
  username: string;
  label: (fatherRow: Record<string, unknown>) => string;
  fatherTable: any;
  fatherPkColumn: any;
  children?: SnapshotChildSpec[];
}

/**
 * Snapshot atómico (padre + hijos) + borrado físico, todo en una transacción.
 * Si el snapshot falla, NO se borra nada. Devuelve la fila padre borrada (o null si no existía).
 */
export function deleteWithSnapshot(
  opts: DeleteWithSnapshotOptions,
): Record<string, unknown> | null {
  return db.transaction((tx) => {
    const father = tx
      .select()
      .from(opts.fatherTable)
      .where(eq(opts.fatherPkColumn, opts.recordId as any))
      .get();
    if (!father) return null;

    const children: Record<string, Record<string, unknown>[]> = {};
    for (const spec of opts.children ?? []) {
      children[spec.key] = tx
        .select()
        .from(spec.table)
        .where(eq(spec.fkColumn, opts.recordId as any))
        .all();
    }

    tx.insert(deletedRecords)
      .values({
        entity: opts.entity,
        recordId: String(opts.recordId),
        label: opts.label(father as Record<string, unknown>),
        payload: { row: father, children } as any,
        deletedBy: opts.username,
        deletedAt: new Date().toISOString(),
      })
      .run();

    tx.delete(opts.fatherTable)
      .where(eq(opts.fatherPkColumn, opts.recordId as any))
      .run();

    return father as Record<string, unknown>;
  });
}

/**
 * Purga: marca vencidos (deletedAt < retentionDays) y los borra físicamente.
 * Nunca toca registros restaurados (quedan como histórico). Idempotente.
 */
export function purgeExpiredDeletedRecords(
  retentionDays = 90,
): { marked: number; deleted: number } {
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const now = new Date().toISOString();

  const marked = db
    .update(deletedRecords)
    .set({ purgedAt: now })
    .where(
      and(
        isNull(deletedRecords.purgedAt),
        isNull(deletedRecords.restoredAt),
        lt(deletedRecords.deletedAt, cutoff),
      ),
    )
    .run();

  const removed = db
    .delete(deletedRecords)
    .where(
      and(isNotNull(deletedRecords.purgedAt), isNull(deletedRecords.restoredAt)),
    )
    .run();

  return { marked: marked.changes, deleted: removed.changes };
}

// === RESTAURACIÓN ===

export interface RestoreChildSpec {
  key: string;
  table: any;
  fkColumn: any;
  fkProperty: string;
}

export interface RestoreFkGuard {
  childKey: string; // clave en payload.children
  property: string; // propiedad JS de la fila hija a validar
  refTable: any;
  refColumn: any;
  errorMessage: string;
}

export interface RestoreSpec {
  table: any;
  pkColumn: any;
  pkProperty: string;
  uniqueFields: string[];
  children?: RestoreChildSpec[];
  fkGuards?: RestoreFkGuard[];
}

export const RESTORE_REGISTRY: Record<string, RestoreSpec> = {
  oficina: {
    table: offices,
    pkColumn: offices.id,
    pkProperty: "id",
    uniqueFields: ["code"],
    children: [
      { key: "officeContacts", table: officeContacts, fkColumn: officeContacts.officeId, fkProperty: "officeId" },
      { key: "officeAssets", table: officeAssets, fkColumn: officeAssets.officeId, fkProperty: "officeId" },
      { key: "officeInvgateLinks", table: officeInvgateLinks, fkColumn: officeInvgateLinks.officeId, fkProperty: "officeId" },
    ],
    fkGuards: [
      {
        childKey: "officeContacts",
        property: "contactId",
        refTable: contacts,
        refColumn: contacts.id,
        errorMessage:
          "No se puede restaurar: hay contactos vinculados que fueron borrados.",
      },
    ],
  },
  cubic: {
    table: cubics,
    pkColumn: cubics.id,
    pkProperty: "id",
    uniqueFields: ["name"],
    children: [
      { key: "cubicAssignments", table: cubicAssignments, fkColumn: cubicAssignments.cubicId, fkProperty: "cubicId" },
    ],
    fkGuards: [
      {
        childKey: "cubicAssignments",
        property: "agentId",
        refTable: agents,
        refColumn: agents.id,
        errorMessage:
          "No se puede restaurar: hay asignaciones a agentes que fueron borrados.",
      },
    ],
  },
  agente: {
    table: agents,
    pkColumn: agents.id,
    pkProperty: "id",
    uniqueFields: ["name"],
  },
};

export interface RestoreResult {
  ok: boolean;
  newId?: number | string;
  renamedFields?: string[];
  error?: string;
}

/** Restaura un registro de la papelera. Toda la operación es transaccional. */
export async function restoreRecord(
  deletedRecordId: number,
  username: string,
): Promise<RestoreResult> {
  const [rec] = await db
    .select()
    .from(deletedRecords)
    .where(eq(deletedRecords.id, deletedRecordId));
  if (!rec) return { ok: false, error: "El registro de la papelera no existe." };
  if (rec.restoredAt)
    return { ok: false, error: "El registro ya fue restaurado." };
  if (rec.purgedAt) return { ok: false, error: "El registro ya fue purgado." };

  const spec = RESTORE_REGISTRY[rec.entity];
  if (!spec) {
    return {
      ok: false,
      error: `La entidad "${rec.entity}" no tiene restauración habilitada (recuperable solo por SQL).`,
    };
  }

  const payload = rec.payload as unknown as DeletedPayload;
  const renamedFields: string[] = [];

  try {
    const newId = db.transaction((tx) => {
      const suffix = " (restaurado)";
      const row: Record<string, unknown> = { ...payload.row };

      // PK original: si sigue libre, se conserva; si no, autoincrement (se omite el id)
      const originalId = row[spec.pkProperty];
      if (originalId != null) {
        const existing = tx
          .select({ one: spec.pkColumn })
          .from(spec.table)
          .where(eq(spec.pkColumn, originalId as any))
          .get();
        if (existing) delete row[spec.pkProperty];
      }

      // Únicos ocupados → sufijo
      for (const field of spec.uniqueFields) {
        if (row[field] == null) continue;
        const conflict = tx
          .select({ one: spec.pkColumn })
          .from(spec.table)
          .where(eq((spec.table as any)[field], row[field] as any))
          .get();
        if (conflict) {
          row[field] = `${String(row[field])}${suffix}`;
          renamedFields.push(field);
        }
      }

      const inserted = tx
        .insert(spec.table)
        .values(row as any)
        .returning({ id: spec.pkColumn })
        .get();
      const fatherId = inserted.id as number | string;

      // Guards de FK (no aplicadas en runtime): detectar hijos huérfanos con error claro
      for (const guard of spec.fkGuards ?? []) {
        for (const childRow of payload.children?.[guard.childKey] ?? []) {
          const value = childRow[guard.property];
          if (value == null) continue;
          const ref = tx
            .select({ one: guard.refColumn })
            .from(guard.refTable)
            .where(eq(guard.refColumn, value as any))
            .get();
          if (!ref) throw new Error(guard.errorMessage);
        }
      }

      for (const child of spec.children ?? []) {
        const rows = (payload.children?.[child.key] ?? []).map((r) => ({
          ...r,
          [child.fkProperty]: fatherId,
        }));
        if (rows.length > 0) {
          tx.insert(child.table).values(rows as any).run();
        }
      }

      tx.update(deletedRecords)
        .set({ restoredAt: new Date().toISOString() })
        .where(eq(deletedRecords.id, deletedRecordId))
        .run();

      return fatherId;
    });

    await logAdminAction(
      username,
      `Restauró "${rec.label}" desde la papelera${
        renamedFields.length ? ` (renombrados: ${renamedFields.join(", ")})` : ""
      }`,
    );
    return { ok: true, newId, renamedFields };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Error al restaurar: ${msg}` };
  }
}
