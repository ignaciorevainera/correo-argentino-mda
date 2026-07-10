import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "soporte",
  redirectPath: "soportes",
  requiredFeature: "Administrar Contenido",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(supportGuides)
      .where(eq(supportGuides.id, id))
      .returning({ helpDeskName: supportGuides.helpDeskName });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Soporte "${(d as any).helpDeskName}" eliminado con éxito.`
    : "Soporte eliminado con éxito.",
  logMessage: (d) => `Eliminó el soporte "${(d as any)?.helpDeskName}"`,
});
