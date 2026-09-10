import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@db/index";
import { deletedRecords } from "@db/schema";

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
      payload: input.payload,
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
