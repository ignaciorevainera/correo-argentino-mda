import type { APIRoute } from "astro";
import { handleReorder } from "@lib/reorderHandler";
import { resourceCategories } from "@db/schema";

export const POST: APIRoute = async ({ request, locals }) =>
  handleReorder(
    request,
    locals,
    resourceCategories,
    (count) => `Reordenó ${count} categorías de recursos`,
    { errorLabel: "Reorder Categorias Recursos API" },
  );
