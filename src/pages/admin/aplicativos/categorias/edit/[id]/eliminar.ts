import { createCategoryDeleteHandler } from "@lib/api/deleteCategory";
import { applicationCategories, applications } from "@db/schema";
import { deleteAppPhysicalFile } from "@lib/api/deleteAppFile";

export const POST = createCategoryDeleteHandler({
  categoryTable: applicationCategories,
  itemsTable: applications,
  categoryIdColumn: applicationCategories.id,
  itemsCategoryColumn: applications.categoryId,
  defaultCategoryTitle: "Sin Categoría",
  defaultCategoryValues: { title: "Sin Categoría" },
  redirectPath: "admin/aplicativos",
  entityName: "la categoría de aplicativos",
  deleteItemFiles: async (item: any) => {
    if (item.filePath) {
      await deleteAppPhysicalFile(item.filePath);
    }
  },
});
