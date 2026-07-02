import { db } from "@db/index";
import { resourceLinks } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "enlace",
  redirectPath: "admin/recursos",
  invalidIdMessage: "ID de enlace no proporcionado",
  performDelete: async (id) => {
    const existing = await db.query.resourceLinks.findFirst({
      where: eq(resourceLinks.id, id),
    });
    if (existing) {
      await db.delete(resourceLinks).where(eq(resourceLinks.id, id));
      return existing as Record<string, unknown>;
    }
    return null;
  },
  successMessage: () => "Enlace eliminado con éxito",
  logMessage: (d) => d ? `Eliminó el enlace "${(d as any).title}"` : "Eliminó un enlace",
});
