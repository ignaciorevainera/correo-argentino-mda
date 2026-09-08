import type { APIRoute } from "astro";
import { handleReorder } from "@lib/reorderHandler";
import { applicationCategories } from "@db/schema";

export const POST: APIRoute = async ({ request, locals }) =>
  handleReorder(
    request,
    locals,
    applicationCategories,
    (count) => `Reordenó ${count} categorías de aplicativos`,
    { errorLabel: "Reorder Categorias Aplicativos API" },
  );
