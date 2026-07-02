import { db } from "@db/index";
import { providerContacts } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "contacto",
  redirectPath: "admin/contactos",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(providerContacts)
      .where(eq(providerContacts.id, id))
      .returning({ provider: providerContacts.provider, service: providerContacts.service });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Contacto "${(d as any).provider} - ${(d as any).service}" eliminado con éxito.`
    : "Contacto eliminado con éxito.",
  logMessage: (d) => d
    ? `Eliminó el contacto "${(d as any).provider} - ${(d as any).service}"`
    : undefined,
});
