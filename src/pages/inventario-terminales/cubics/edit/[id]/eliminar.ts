import { deleteWithSnapshot } from "@lib/deletedRecords";
import { cubics, cubicAssignments } from "@db/schema";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "cubic",
  redirectPath: "inventario-terminales",
  requiredFeature: "Administrar Contenido",
  genericSnapshot: false,
  performDelete: async (id, { username }) =>
    deleteWithSnapshot({
      entity: "cubic",
      recordId: id,
      username,
      label: (father) =>
        `${father.name}${(father as any).ip ? ` (${(father as any).ip})` : ""}`,
      fatherTable: cubics,
      fatherPkColumn: cubics.id,
      children: [
        { key: "cubicAssignments", table: cubicAssignments, fkColumn: cubicAssignments.cubicId, fkProperty: "cubicId" },
      ],
    }),
  successMessage: (d) =>
    d
      ? `Ordenador "${(d as any).name}" dado de baja con éxito.`
      : "Ordenador dado de baja con éxito.",
  notFoundMessage: "El cubic no existe.",
  errorMessage: () => "Error al eliminar el cubic",
  logMessage: (d) => `Eliminó el cubic "${(d as any)?.name}"`,
});
