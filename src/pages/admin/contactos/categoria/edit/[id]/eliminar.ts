import { createCategoryDeleteHandler } from "@lib/api/deleteCategory";
import { contactCategories, providerContacts } from "@db/schema";

export const POST = createCategoryDeleteHandler({
  categoryTable: contactCategories,
  itemsTable: providerContacts,
  categoryIdColumn: contactCategories.id,
  itemsCategoryColumn: providerContacts.categoryId,
  defaultCategoryTitle: "Sin Categoría",
  defaultCategoryValues: { title: "Sin Categoría", icon: "boxicons:folder", tone: "neutral" },
  redirectPath: "admin/contactos",
  entityName: "la categoría de contactos",
});
