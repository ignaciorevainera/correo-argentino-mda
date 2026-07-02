import { db } from "@db/index";
import { offices } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "oficina",
  redirectPath: "oficinas",
  requiredFeature: "Administrar Contenido",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(offices)
      .where(eq(offices.id, id))
      .returning({ code: offices.code, name: offices.name });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Oficina "${(d as any).name}" (${(d as any).code}) eliminada con éxito.`
    : "Oficina eliminada con éxito.",
  logMessage: (d) => `Eliminó la oficina "${(d as any)?.name}" (${(d as any)?.code})`,
});
