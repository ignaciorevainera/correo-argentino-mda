import type { APIRoute } from "astro";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import type { InvgateKbArticle } from "@/types/invgate";

interface KbArticlesListResponse {
  status: string;
  data: InvgateKbArticle[];
}

export const GET: APIRoute = async ({ url, locals }) => {
  const accessError = requireReadAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("page_size") || "50", 10)));

  try {
    const result = await invgateQaGet<KbArticlesListResponse>(
      `kb.articles?page=${page}&page_size=${pageSize}`,
    );

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const articles = Array.isArray(result.data?.data) ? result.data.data : [];

    return jsonResponse({ articles, page, page_size: pageSize }, 200, "private, max-age=30");
  } catch (error: any) {
    console.error("[KB Articles] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
