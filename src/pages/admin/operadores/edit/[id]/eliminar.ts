import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";
import { deleteWithSnapshot } from "@lib/deletedRecords";

export const POST = createDeleteHandler({
  entityName: "operador",
  redirectPath: "admin/operadores",
  genericSnapshot: false,
  performDelete: async (id, { username }) =>
    deleteWithSnapshot({
      entity: "agente",
      recordId: id,
      username,
      label: (father) => String(father.name),
      fatherTable: agents,
      fatherPkColumn: agents.id,
    }),
  afterDelete: async ({ deleted }) => {
    if (deleted) {
      await db
        .delete(schedules)
        .where(eq(schedules.agentName, (deleted as any).name));
    }
  },
  successMessage: () => "Operador eliminado con éxito.",
});
