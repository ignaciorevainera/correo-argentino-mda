import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse } from "@lib/apiResponse";
import type {
  InvgateKbCategory,
  InvgateKbSearchResponse,
} from "@/types/invgate";

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return jsonResponse({ error: "?q= requiere al menos 2 caracteres" }, 400);
  }

  try {
    const [articlesResult, categoriesResult] = await Promise.all([
      invgateGet<InvgateKbSearchResponse>(
        `kb.articles.by.keywords?keywords=${encodeURIComponent(q)}&page_size=10`,
      ),
      invgateGet<InvgateKbCategory[]>("kb.categories"),
    ]);

    if (!articlesResult.ok) {
      return jsonResponse({ error: articlesResult.message }, articlesResult.status);
    }

    const categoryMap = new Map<number, string>();

    if (categoriesResult.ok) {
      const cats = categoriesResult.data;

      if (Array.isArray(cats)) {
        for (const cat of cats) {
          if (cat.id && cat.name) {
            categoryMap.set(cat.id, cat.name);
          }
        }
      }
    }

    const articles = Array.isArray(articlesResult.data.data)
      ? articlesResult.data.data
      : [];

    const results = articles.map((article) => ({
      id: article.id,
      title: article.title,
      category: article.category_id != null ? categoryMap.get(article.category_id) ?? null : null,
    }));

    return jsonResponse(
      { articles: results },
      200,
      "private, max-age=60",
    );
  } catch (error: any) {
    console.error("[InvGate KB Search] Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
