import { db } from "@db/index";
import { cubics, cubicAssignments } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "cubic",
  redirectPath: "inventario-terminales",
  requiredFeature: "Administrar Contenido",
  beforeDelete: async ({ id }) => {
    await db.delete(cubicAssignments).where(eq(cubicAssignments.cubicId, id));
  },
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(cubics)
      .where(eq(cubics.id, id))
      .returning({ name: cubics.name });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Ordenador "${(d as any).name}" dado de baja con éxito.`
    : "Cubic eliminado con éxito.",
  logMessage: (d) => `Eliminó el cubic "${(d as any)?.name}"`,
});
