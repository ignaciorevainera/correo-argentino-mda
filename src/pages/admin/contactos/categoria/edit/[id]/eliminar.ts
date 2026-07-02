import type { APIRoute } from "astro";
import { db } from "@db/index";
import { contactCategories, providerContacts } from "@db/schema";
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
      .from(contactCategories)
      .where(eq(contactCategories.title, "Sin Categoría"))
      .limit(1);

    if (existingDefault.length > 0 && categoryId === existingDefault[0].id) {
      const cleanBase = getBaseNoSlash();
      return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent("No se puede eliminar la categoría por defecto")}&toast_type=error`);
    }

    if (deleteOption === "unassign") {
      let defaultCategoryId;
      if (existingDefault.length === 0) {
        const [inserted] = await db.insert(contactCategories).values({
          title: "Sin Categoría",
          icon: "boxicons:folder",
          tone: "neutral",
        }).returning({ id: contactCategories.id });
        defaultCategoryId = inserted.id;
      } else {
        defaultCategoryId = existingDefault[0].id;
      }

      // Reasignar los contactos a la categoría por defecto
      await db
        .update(providerContacts)
        .set({ categoryId: defaultCategoryId })
        .where(eq(providerContacts.categoryId, categoryId));
    }

    if (deleteOption === "cascade") {
      await db.delete(providerContacts).where(eq(providerContacts.categoryId, categoryId));
    }

    // Eliminar la categoría
    await db.delete(contactCategories).where(eq(contactCategories.id, categoryId));
    await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó la categoría de contactos ID ${categoryId}`);

    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent("Categoría eliminada con éxito")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar categoría:", error);
    const cleanBase = getBaseNoSlash();
    return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent("Error al eliminar la categoría")}&toast_type=error`);
  }
};
