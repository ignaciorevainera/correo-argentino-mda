import { db } from "@db/index";
import { applications } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";
import { deleteAppPhysicalFile } from "@lib/api/deleteAppFile";

export const POST = createDeleteHandler({
  entityName: "aplicativo",
  redirectPath: "admin/aplicativos",
  performDelete: async (id) => {
    const [existing] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));

    if (!existing) return null;

    if (existing.filePath) {
      await deleteAppPhysicalFile(existing.filePath);
    }

    await db.delete(applications).where(eq(applications.id, id));
    return existing as Record<string, unknown>;
  },
  successMessage: (d) => d
    ? `Aplicativo "${(d as any).title}" eliminado con éxito.`
    : "Aplicativo eliminado con éxito.",
  logMessage: (d) => d
    ? `Eliminó el aplicativo "${(d as any).title}"`
    : undefined,
});
