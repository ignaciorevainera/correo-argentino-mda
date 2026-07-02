import type { APIRoute } from "astro";
import { db } from "@db/index";
import { resourceCategories, resourceLinks } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { getBaseNoSlash } from "@lib/baseUrl";

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const categoryId = parseInt(params.id as string, 10);
  if (!categoryId || isNaN(categoryId)) return new Response("ID de categoría no válido", { status: 400 });

  const formData = await request.formData();
  const deleteOption = formData.get("deleteOption")?.toString(); // "cascade" | "unassign"

  try {
    let existingDefault = await db
      .select()
      .from(resourceCategories)
      .where(eq(resourceCategories.title, "Sin Categoría"))
      .limit(1);

    if (existingDefault.length > 0 && categoryId === existingDefault[0].id) {
      const cleanBase = getBaseNoSlash();
      return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("No se puede eliminar la categoría por defecto")}&toast_type=error`);
    }

    if (deleteOption === "unassign") {
      let defaultCategoryId;
      if (existingDefault.length === 0) {
        const [inserted] = await db.insert(resourceCategories).values({
          title: "Sin Categoría",
          iconName: "boxicons:folder",
          tone: "neutral",
        }).returning({ id: resourceCategories.id });
        defaultCategoryId = inserted.id;
      } else {
        defaultCategoryId = existingDefault[0].id;
      }

      // Reasignar los enlaces a la categoría por defecto
      await db
        .update(resourceLinks)
        .set({ categoryId: defaultCategoryId })
        .where(eq(resourceLinks.categoryId, categoryId));
    }

    // Si fue 'unassign', los enlaces ya se movieron. 
    // Si fue 'cascade', la eliminación de la categoría los eliminará en cascada (depende de ON DELETE CASCADE de la BD)
    // Para mayor seguridad en caso de que SQLite no tenga activado PRAGMA foreign_keys, eliminamos los enlaces manualmente si es cascada.
    if (deleteOption === "cascade") {
      await db.delete(resourceLinks).where(eq(resourceLinks.categoryId, categoryId));
    }

    // Obtener el nombre de la categoría antes de eliminarla
    const [categoryToDelete] = await db
      .select({ title: resourceCategories.title })
      .from(resourceCategories)
      .where(eq(resourceCategories.id, categoryId))
      .limit(1);
    const categoryTitle = categoryToDelete?.title || categoryId;

    // Eliminar la categoría
    await db.delete(resourceCategories).where(eq(resourceCategories.id, categoryId));
    await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó la categoría de recursos "${categoryTitle}"`);

    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("Categoría eliminada con éxito")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar categoría:", error);
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/recursos?toast_msg=${encodeURIComponent("Error al eliminar la categoría")}&toast_type=error`);
  }
};
