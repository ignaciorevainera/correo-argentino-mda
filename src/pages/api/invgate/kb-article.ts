import type { APIRoute } from "astro";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import type { InvgateKbArticle } from "@/types/invgate";

interface KbArticleSingleResponse {
  status: string;
  data: InvgateKbArticle[];
}

export const GET: APIRoute = async ({ url, locals }) => {
  const accessError = requireReadAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  const id = url.searchParams.get("id");
  if (!id || isNaN(parseInt(id, 10))) {
    return jsonResponse({ error: "Parámetro ?id= requerido (integer)" }, 400);
  }

  try {
    const result = await invgateQaGet<KbArticleSingleResponse>(
      `kb.articles?id=${parseInt(id, 10)}`,
    );

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const articles = result.data?.data;
    if (!Array.isArray(articles) || articles.length === 0) {
      return jsonResponse({ error: "Artículo no encontrado" }, 404);
    }

    const article = articles[0];

    return jsonResponse({ article }, 200, "private, max-age=10");
  } catch (error: any) {
    console.error("[KB Article] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
