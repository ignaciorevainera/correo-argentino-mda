import type { APIRoute } from "astro";
import { kbArticles } from "@db/schema";
import { logAdminFromAstro } from "@lib/auditLogger";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { validateRequestCsrf } from "@lib/csrf";
import { deleteWithSnapshot } from "@lib/deletedRecords";
import { getArticle, type KbScope } from "@lib/kb";
import { getModulePermissions } from "@lib/rbac";
import { can } from "@lib/roleConfig";

export const POST: APIRoute = async ({ params, request, locals }) => {
  const rawId = params.id;
  const id = Number(rawId);
  if (!rawId || !/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
    return redirectWithToast(
      "/base-conocimiento",
      "El artículo no existe.",
      "error",
    );
  }

  const user = locals.user;
  if (!getModulePermissions("base-conocimiento", user.role).canWrite) {
    return redirectWithToast(
      "/base-conocimiento",
      "No tenés permisos para eliminar artículos.",
      "error",
    );
  }

  const scope: KbScope = {
    helpdeskId: user.helpdeskId,
    includeAll: can(user.role, "admin"),
  };
  const article = getArticle(id, scope);
  if (!article) {
    return redirectWithToast(
      "/base-conocimiento",
      "El artículo no existe.",
      "error",
    );
  }

  if (!(await validateRequestCsrf(request, locals))) {
    return redirectWithToast(
      `/base-conocimiento/${id}`,
      "Token CSRF inválido o ausente",
      "error",
    );
  }

  const deleted = deleteWithSnapshot({
    entity: "articulo",
    recordId: id,
    username: user.username || "Sistema",
    label: () =>
      `Artículo "${article.title}" · ${
        article.mesaName ?? `mesa ${article.helpdeskId}`
      }${article.category ? ` · ${article.category}` : ""}`,
    fatherTable: kbArticles,
    fatherPkColumn: kbArticles.id,
  });

  if (!deleted) {
    return redirectWithToast(
      "/base-conocimiento",
      "El artículo no existe.",
      "error",
    );
  }

  await logAdminFromAstro(locals, `Eliminó el artículo "${article.title}"`);
  return redirectWithToast(
    "/base-conocimiento",
    "Artículo movido a la papelera.",
  );
};
