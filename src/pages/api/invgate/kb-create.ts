import type { APIRoute } from "astro";
import { invgateQaPost } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { logAdminFromAstro } from "@lib/auditLogger";

interface InvGateCreateResponse {
  article_id: number;
  status: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const accessError = requireWriteAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  try {
    const fd = await request.formData();
    const title = fd.get("title")?.toString().trim() || "";
    const content = fd.get("content")?.toString() || "";
    const categoryId = parseInt(fd.get("category_id")?.toString() || "0", 10);
    const authorId = locals.user?.id;

    if (!title) {
      return jsonResponse({ error: "El título es obligatorio" }, 400);
    }
    if (!content) {
      return jsonResponse({ error: "El contenido es obligatorio" }, 400);
    }
    if (!categoryId || categoryId <= 0) {
      return jsonResponse({ error: "Seleccioná una categoría" }, 400);
    }
    if (!authorId) {
      return jsonResponse({ error: "Sesión no válida" }, 401);
    }

    const result = await invgateQaPost<InvGateCreateResponse>("kb.articles", {
      title,
      content,
      category_id: categoryId,
      author_id: authorId,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const articleId = result.data?.article_id;
    if (articleId) {
      await logAdminFromAstro(
        locals,
        `Creó artículo KB #${articleId} "${title}" en InvGate QA`,
      );
    }

    return jsonResponse({ success: true, article_id: articleId }, 200);
  } catch (error: any) {
    console.error("[KB Create] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
