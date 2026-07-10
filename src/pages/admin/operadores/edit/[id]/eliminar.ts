import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "operador",
  redirectPath: "admin/operadores",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(agents)
      .where(eq(agents.id, id))
      .returning({ id: agents.id, name: agents.name });
    return deleted ?? null;
  },
  afterDelete: async ({ deleted }) => {
    if (deleted) {
      await db.delete(schedules).where(eq(schedules.agentName, (deleted as any).name));
    }
  },
  successMessage: () => "Operador eliminado con éxito.",
});
