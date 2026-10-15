import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@db/index";
import { kbArticles, kbCategories } from "@db/schema";

export const KB_DEFAULT_CATEGORIES = [
  "Accesos",
  "Guías",
  "Preguntas frecuentes",
  "Procedimientos",
  "Soluciones",
] as const;

export type KbCategory = { id: number; name: string };

export type KbCategoryCreateResult =
  | { ok: true; id: number; name: string }
  | { ok: false; reason: "invalid" | "duplicate" };

export type KbCategoryRenameResult =
  | { ok: true; name: string; previousName: string; articlesUpdated: number }
  | { ok: false; reason: "invalid" | "not_found" | "duplicate" };

export type KbCategoryDeleteResult =
  | { ok: true; name: string; articlesInUse: 0 }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "in_use"; name: string; articlesInUse: number };

function normalizeCategoryName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Clave de comparación de categorías: `normalizeCategoryName` (NFC + espacios
 * colapsados + trim) más minúsculas. SQLite no puede replicar NFC ni el
 * `lower()` de acentos, así que toda comparación entre el catálogo y
 * `kb_articles.category` pasa por acá en JS.
 */
export function categoryKey(raw: string): string {
  return normalizeCategoryName(raw).toLowerCase();
}

function isValidHelpdeskId(helpdeskId: number): boolean {
  return Number.isInteger(helpdeskId) && helpdeskId > 0;
}

export function ensureDefaultCategories(helpdeskId: number): void {
  if (!isValidHelpdeskId(helpdeskId)) return;

  db.insert(kbCategories)
    .values(KB_DEFAULT_CATEGORIES.map((name) => ({ helpdeskId, name })))
    .onConflictDoNothing()
    .run();
}

export function listCategories(helpdeskId: number): KbCategory[] {
  if (!isValidHelpdeskId(helpdeskId)) return [];

  const [existing] = db
    .select({ total: sql<number>`count(*)` })
    .from(kbCategories)
    .where(eq(kbCategories.helpdeskId, helpdeskId))
    .all();

  if (Number(existing?.total ?? 0) === 0) {
    ensureDefaultCategories(helpdeskId);
  }

  return db
    .select({ id: kbCategories.id, name: kbCategories.name })
    .from(kbCategories)
    .where(eq(kbCategories.helpdeskId, helpdeskId))
    .orderBy(sql`lower(${kbCategories.name})`, kbCategories.id)
    .all();
}

function findDuplicate(
  helpdeskId: number,
  name: string,
  excludeId?: number,
): { id: number } | undefined {
  const [row] = db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(
      and(
        eq(kbCategories.helpdeskId, helpdeskId),
        sql`lower(${kbCategories.name}) = lower(${name})`,
        excludeId ? sql`${kbCategories.id} <> ${excludeId}` : undefined,
      ),
    )
    .limit(1)
    .all();
  return row;
}

export function createCategory(input: {
  helpdeskId: number;
  name: string;
  userId: number | null;
}): KbCategoryCreateResult {
  const name = normalizeCategoryName(input.name);
  if (
    !isValidHelpdeskId(input.helpdeskId) ||
    name.length < 2 ||
    name.length > 60
  ) {
    return { ok: false, reason: "invalid" };
  }
  const [existing] = db
    .select({ total: sql<number>`count(*)` })
    .from(kbCategories)
    .where(eq(kbCategories.helpdeskId, input.helpdeskId))
    .all();

  if (Number(existing?.total ?? 0) === 0) {
    ensureDefaultCategories(input.helpdeskId);
  }

  if (findDuplicate(input.helpdeskId, name)) {
    return { ok: false, reason: "duplicate" };
  }

  const [row] = db
    .insert(kbCategories)
    .values({
      helpdeskId: input.helpdeskId,
      name,
      createdByUserId: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: kbCategories.id })
    .all();

  if (!row) return { ok: false, reason: "duplicate" };
  return { ok: true, id: row.id, name };
}

export function renameCategory(input: {
  id: number;
  helpdeskId: number;
  name: string;
}): KbCategoryRenameResult {
  const name = normalizeCategoryName(input.name);
  if (name.length < 2 || name.length > 60) {
    return { ok: false, reason: "invalid" };
  }

  return db.transaction((tx) => {
    const [current] = tx
      .select({ id: kbCategories.id, name: kbCategories.name })
      .from(kbCategories)
      .where(
        and(
          eq(kbCategories.id, input.id),
          eq(kbCategories.helpdeskId, input.helpdeskId),
        ),
      )
      .limit(1)
      .all();

    if (!current) return { ok: false, reason: "not_found" } as const;
    if (current.name === name) {
      return {
        ok: true as const,
        name,
        previousName: name,
        articlesUpdated: 0,
      };
    }

    const [duplicate] = tx
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(
        and(
          eq(kbCategories.helpdeskId, input.helpdeskId),
          sql`lower(${kbCategories.name}) = lower(${name})`,
          sql`${kbCategories.id} <> ${input.id}`,
        ),
      )
      .limit(1)
      .all();

    if (duplicate) return { ok: false, reason: "duplicate" } as const;

    tx.update(kbCategories)
      .set({ name })
      .where(eq(kbCategories.id, input.id))
      .run();
    const previousKey = categoryKey(current.name);
    const variants = [
      ...new Set(
        tx
          .select({ category: kbArticles.category })
          .from(kbArticles)
          .where(eq(kbArticles.helpdeskId, input.helpdeskId))
          .all()
          .filter(
            (row) =>
              row.category != null &&
              categoryKey(row.category) === previousKey,
          )
          .map((row) => row.category as string),
      ),
    ];

    const cascaded =
      variants.length > 0
        ? tx
            .update(kbArticles)
            .set({ category: name })
            .where(
              and(
                eq(kbArticles.helpdeskId, input.helpdeskId),
                inArray(kbArticles.category, variants),
              ),
            )
            .run()
        : { changes: 0 };

    return {
      ok: true as const,
      name,
      previousName: current.name,
      articlesUpdated: cascaded.changes,
    };
  });
}

export function listCategoryCounts(helpdeskId: number): Map<string, number> {
  const counts = new Map<string, number>();
  if (!isValidHelpdeskId(helpdeskId)) return counts;

  const rows = db
    .select({
      name: kbArticles.category,
      total: sql<number>`count(*)`,
    })
    .from(kbArticles)
    .where(eq(kbArticles.helpdeskId, helpdeskId))
    .groupBy(kbArticles.category)
    .all();

  // La clave del Map es `categoryKey`: variantes de espacio/mayúsculas suman
  // en la misma entrada. El consumidor debe buscar por `categoryKey(nombre)`.
  for (const row of rows) {
    if (row.name == null) continue;
    const key = categoryKey(row.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + Number(row.total));
  }
  return counts;
}

type KbCategoriesExecutor = Pick<typeof db, "select">;

export function countArticlesWithCategory(
  helpdeskId: number,
  name: string,
  executor: KbCategoriesExecutor = db,
): number {
  // Compara en JS (SQLite no puede replicar NFC ni el lower() de acentos), así
  // que materializa las filas de la mesa en lugar de un count(*) indexado. A la
  // escala de la KB es despreciable; si kb_articles crece, denormalizar una
  // columna `category_key` y comparar en SQL.
  const target = categoryKey(name);
  const rows = executor
    .select({ category: kbArticles.category })
    .from(kbArticles)
    .where(eq(kbArticles.helpdeskId, helpdeskId))
    .all();
  return rows.reduce(
    (total, row) =>
      row.category != null && categoryKey(row.category) === target
        ? total + 1
        : total,
    0,
  );
}

export function deleteCategory(input: {
  id: number;
  helpdeskId: number;
}): KbCategoryDeleteResult {
  return db.transaction((tx) => {
    const [current] = tx
      .select({ id: kbCategories.id, name: kbCategories.name })
      .from(kbCategories)
      .where(
        and(
          eq(kbCategories.id, input.id),
          eq(kbCategories.helpdeskId, input.helpdeskId),
        ),
      )
      .limit(1)
      .all();

    if (!current) return { ok: false as const, reason: "not_found" as const };

    const articlesInUse = countArticlesWithCategory(
      input.helpdeskId,
      current.name,
      tx,
    );
    if (articlesInUse > 0) {
      return {
        ok: false as const,
        reason: "in_use" as const,
        name: current.name,
        articlesInUse,
      };
    }

    tx.delete(kbCategories).where(eq(kbCategories.id, input.id)).run();
    return {
      ok: true as const,
      name: current.name,
      articlesInUse: 0 as const,
    };
  });
}
