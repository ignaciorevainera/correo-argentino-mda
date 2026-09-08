import type { APIRoute } from "astro";
import { handleReorder } from "@lib/reorderHandler";
import { applications } from "@db/schema";

export const POST: APIRoute = async ({ request, locals }) =>
  handleReorder(
    request,
    locals,
    applications,
    (count) => `Reordenó y/o recategorizó ${count} aplicativos`,
    {
      mapItem: (item) => ({
        categoryId:
          item.categoryId === "uncategorized" ? null : item.categoryId,
      }),
      errorLabel: "Reorder Aplicativos API",
    },
  );
