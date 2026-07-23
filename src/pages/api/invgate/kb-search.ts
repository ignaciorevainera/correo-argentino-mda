import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import type {
  InvgateKbCategory,
  InvgateKbSearchResponse,
} from "@/types/invgate";

function extractArticleId(query: string): number | null {
  const match = query.match(/^#?(\d+)$/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return id > 0 ? id : null;
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return jsonResponse({ error: "?q= requiere al menos 2 caracteres" }, 400);
  }

  try {
    const articleId = extractArticleId(q);

    const promises: [
      Promise<any>,
      Promise<any>,
      Promise<any> | Promise<null>,
    ] = [
      invgateGet<InvgateKbSearchResponse>(
        `kb.articles.by.keywords?keywords=${encodeURIComponent(q)}&page_size=10`,
      ),
      invgateGet<InvgateKbCategory[]>("kb.categories"),
      articleId
        ? invgateGet<InvgateKbSearchResponse>(
            `kb.articles.by.ids?ids[]=${articleId}`,
          )
        : Promise.resolve(null),
    ];

    const [articlesResult, categoriesResult, idResult] = await Promise.all(promises);

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

    const keywordArticles = Array.isArray(articlesResult.data.data)
      ? articlesResult.data.data
      : [];

    const idArticles =
      idResult?.ok && Array.isArray(idResult.data?.data)
        ? idResult.data.data
        : [];

    const seenIds = new Set<number>();
    const combined = [];

    for (const article of idArticles) {
      if (!seenIds.has(article.id)) {
        seenIds.add(article.id);
        combined.push(article);
      }
    }

    for (const article of keywordArticles) {
      if (!seenIds.has(article.id)) {
        seenIds.add(article.id);
        combined.push(article);
      }
    }

    combined.sort((a, b) => b.id - a.id);

    const results = combined.slice(0, 10).map((article) => ({
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
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
