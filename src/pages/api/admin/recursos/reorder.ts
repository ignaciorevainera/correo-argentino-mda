import type { APIRoute } from "astro";
import { handleReorder } from "@lib/reorderHandler";
import { resourceLinks } from "@db/schema";

export const POST: APIRoute = async ({ request, locals }) =>
  handleReorder(
    request,
    locals,
    resourceLinks,
    (count) => `Reordenó y/o recategorizó ${count} enlaces de recursos`,
    {
      mapItem: (item) => ({ categoryId: item.categoryId }),
      errorLabel: "Reorder API",
    },
  );
