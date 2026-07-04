import type { APIRoute } from "astro";
import { db } from "@db/index";
import { eq } from "drizzle-orm";
import { getBaseNoSlash } from "@lib/baseUrl";
import { logAdminFromAstro } from "@lib/auditLogger";

export interface DeleteCategoryConfig {
  categoryTable: any;
  itemsTable: any;
  categoryIdColumn: any;
  itemsCategoryColumn: any;
  defaultCategoryTitle: string;
  defaultCategoryValues: Record<string, unknown>;
  redirectPath: string;
  entityName: string;
  deleteItemFiles?: (item: Record<string, unknown>) => Promise<void> | void;
}

export function createCategoryDeleteHandler(config: DeleteCategoryConfig): APIRoute {
  return async ({ params, request, redirect, locals }) => {
    const categoryId = parseInt(params.id as string, 10);
    if (!categoryId || isNaN(categoryId)) {
      return new Response("ID de categoría no válido", { status: 400 });
    }

    const formData = await request.formData();
    const deleteOption = formData.get("deleteOption")?.toString();

    try {
      const existingDefault = await db
        .select()
        .from(config.categoryTable)
        .where(eq(config.categoryTable.title, config.defaultCategoryTitle))
        .limit(1);

      if (existingDefault.length > 0 && categoryId === existingDefault[0].id) {
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent("No se puede eliminar la categoría por defecto")}&toast_type=error`
        );
      }

      if (deleteOption === "unassign") {
        let defaultCategoryId: number;
        if (existingDefault.length === 0) {
          const [inserted] = await db
            .insert(config.categoryTable)
            .values(config.defaultCategoryValues)
            .returning({ id: config.categoryTable.id });
          defaultCategoryId = inserted.id;
        } else {
          defaultCategoryId = existingDefault[0].id;
        }
        await db
          .update(config.itemsTable)
          .set({ categoryId: defaultCategoryId })
          .where(eq(config.itemsCategoryColumn, categoryId));
      }

      if (deleteOption === "cascade") {
        const itemsToDelete = await db
          .select()
          .from(config.itemsTable)
          .where(eq(config.itemsCategoryColumn, categoryId));
        if (config.deleteItemFiles) {
          for (const item of itemsToDelete) {
            await config.deleteItemFiles(item);
          }
        }
        await db
          .delete(config.itemsTable)
          .where(eq(config.itemsCategoryColumn, categoryId));
      }

      const [categoryToDelete] = await db
        .select()
        .from(config.categoryTable)
        .where(eq(config.categoryIdColumn, categoryId))
        .limit(1);
      const categoryTitle = categoryToDelete?.title || categoryId;

      await db
        .delete(config.categoryTable)
        .where(eq(config.categoryIdColumn, categoryId));
      await logAdminFromAstro(locals,
        `Eliminó ${config.entityName} "${categoryTitle}"`
      );

      return redirect(
        `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent("Categoría eliminada con éxito")}&toast_type=success`
      );
    } catch (error) {
      console.error(`[deleteCategory] Error al eliminar ${config.entityName}:`, error);
      return redirect(
        `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent("Error al eliminar la categoría")}&toast_type=error`
      );
    }
  };
}
