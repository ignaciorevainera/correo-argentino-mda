import type { APIRoute } from "astro";
import { handleReorder } from "@lib/reorderHandler";
import { contactCategories } from "@db/schema";

export const POST: APIRoute = async ({ request, locals }) =>
  handleReorder(
    request,
    locals,
    contactCategories,
    (count) => `Reordenó ${count} categorías de contactos`,
    { errorLabel: "Reorder Categorias Contactos API" },
  );
