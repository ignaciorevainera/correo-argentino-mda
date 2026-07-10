import { createCategoryDeleteHandler } from "@lib/api/deleteCategory";
import { resourceCategories, resourceLinks } from "@db/schema";

export const POST = createCategoryDeleteHandler({
  categoryTable: resourceCategories,
  itemsTable: resourceLinks,
  categoryIdColumn: resourceCategories.id,
  itemsCategoryColumn: resourceLinks.categoryId,
  defaultCategoryTitle: "Sin Categoría",
  defaultCategoryValues: { title: "Sin Categoría", iconName: "boxicons:folder", tone: "neutral" },
  redirectPath: "admin/recursos",
  entityName: "la categoría de recursos",
});
