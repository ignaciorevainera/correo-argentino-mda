import type { APIRoute } from "astro";
import { invgateQaPut } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { logAdminFromAstro } from "@lib/auditLogger";

interface InvGateUpdateResponse {
  status: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const accessError = requireWriteAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  try {
    const fd = await request.formData();
    const articleId = parseInt(fd.get("article_id")?.toString() || "0", 10);
    const title = fd.get("title")?.toString().trim() || "";
    const content = fd.get("content")?.toString() || "";
    const categoryId = parseInt(fd.get("category_id")?.toString() || "0", 10);
    const authorId = locals.user?.id;

    if (!articleId || articleId <= 0) {
      return jsonResponse({ error: "ID de artículo inválido" }, 400);
    }
    if (!title) {
      return jsonResponse({ error: "El título es obligatorio" }, 400);
    }
    if (!content) {
      return jsonResponse({ error: "El contenido es obligatorio" }, 400);
    }
    if (!authorId) {
      return jsonResponse({ error: "Sesión no válida" }, 401);
    }

    const body: Record<string, unknown> = {
      id: articleId,
      title,
      content,
      author_id: authorId,
    };
    if (categoryId > 0) {
      body.category_id = categoryId;
    }

    const result = await invgateQaPut<InvGateUpdateResponse>("kb.articles", body);

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    await logAdminFromAstro(
      locals,
      `Actualizó artículo KB #${articleId} "${title}" en InvGate QA`,
    );

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("[KB Update] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
