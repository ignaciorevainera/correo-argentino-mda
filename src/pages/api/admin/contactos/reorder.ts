import type { APIRoute } from "astro";
import { handleReorder } from "@lib/reorderHandler";
import { providerContacts } from "@db/schema";

export const POST: APIRoute = async ({ request, locals }) =>
  handleReorder(
    request,
    locals,
    providerContacts,
    (count) => `Reordenó y/o recategorizó ${count} contactos de proveedores`,
    {
      mapItem: (item) => ({
        categoryId:
          item.categoryId === "uncategorized" ? null : item.categoryId,
      }),
      errorLabel: "Reorder Contacts API",
    },
  );
