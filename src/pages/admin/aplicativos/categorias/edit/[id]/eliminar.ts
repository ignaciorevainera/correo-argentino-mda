import type { APIRoute } from "astro";
import { db } from "@db/index";
import { applicationCategories, applications } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { getAppsDir } from "@lib/storage";

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const categoryId = parseInt(params.id as string, 10);
  if (!categoryId || isNaN(categoryId)) return new Response("ID de categoría no válido", { status: 400 });

  const formData = await request.formData();
  const deleteOption = formData.get("deleteOption")?.toString(); // "cascade" | "unassign"

  try {
    let existingDefault = await db
      .select()
      .from(applicationCategories)
      .where(eq(applicationCategories.title, "Sin Categoría"))
      .limit(1);

    if (existingDefault.length > 0 && categoryId === existingDefault[0].id) {
      const base = import.meta.env.BASE_URL || "/";
      const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
      return redirect(`${cleanBase}/admin/aplicativos?toast_msg=${encodeURIComponent("No se puede eliminar la categoría por defecto")}&toast_type=error`);
    }

    if (deleteOption === "unassign") {
      let defaultCategoryId;
      if (existingDefault.length === 0) {
        const [inserted] = await db.insert(applicationCategories).values({
          title: "Sin Categoría",
        }).returning({ id: applicationCategories.id });
        defaultCategoryId = inserted.id;
      } else {
        defaultCategoryId = existingDefault[0].id;
      }

      // Reasignar los aplicativos a la categoría por defecto
      await db
        .update(applications)
        .set({ categoryId: defaultCategoryId })
        .where(eq(applications.categoryId, categoryId));
    }

    if (deleteOption === "cascade") {
      // Obtener todos los aplicativos asociados para borrar sus archivos físicos
      const appsToDelete = await db
        .select()
        .from(applications)
        .where(eq(applications.categoryId, categoryId));

      const fs = await import("node:fs");
      const path = await import("node:path");
      const appsDir = getAppsDir();

      const base = import.meta.env.BASE_URL || "/";
      const cleanBase = base.endsWith("/") ? base : base + "/";
      const downloadPrefix = `${cleanBase}api/download/`;

      for (const app of appsToDelete) {
        if (app.filePath && !app.filePath.startsWith("http")) {
          try {
            const fileName = app.filePath.startsWith(downloadPrefix)
              ? app.filePath.slice(downloadPrefix.length)
              : path.basename(app.filePath);
            const absPath = path.join(appsDir, fileName);
            if (fs.existsSync(absPath)) {
              fs.unlinkSync(absPath);
            }
          } catch (fsError: any) {
            console.error(
              `[eliminar-categoria] No se pudo eliminar el archivo físico: ${fsError.message}`
            );
          }
        }
      }

      await db.delete(applications).where(eq(applications.categoryId, categoryId));
    }

    // Eliminar la categoría
    await db.delete(applicationCategories).where(eq(applicationCategories.id, categoryId));
    await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó la categoría de aplicativos ID ${categoryId}`);

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/aplicativos?toast_msg=${encodeURIComponent("Categoría eliminada con éxito")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar categoría de aplicativos:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/aplicativos?toast_msg=${encodeURIComponent("Error al eliminar la categoría")}&toast_type=error`);
  }
};
