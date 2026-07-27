import type { APIRoute } from "astro";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import type { InvgateKbCategory, InvgateKbCategoriesResponse } from "@/types/invgate";

export const GET: APIRoute = async ({ locals }) => {
  const accessError = requireReadAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  try {
    const result = await invgateQaGet<InvgateKbCategoriesResponse>("kb.categories");

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const categories = Array.isArray(result.data?.data)
      ? result.data.data.map((cat: InvgateKbCategory) => ({
          id: cat.id,
          name: cat.name,
        }))
      : [];

    return jsonResponse({ categories }, 200, "private, max-age=300");
  } catch (error: any) {
    console.error("[KB Categories] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
