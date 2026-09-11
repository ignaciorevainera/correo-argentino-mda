import type { APIRoute } from "astro";
import { getBaseNoSlash } from "@lib/baseUrl";
import { restoreRecord } from "@lib/deletedRecords";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const base = getBaseNoSlash();
  const id = Number(params.id);
  if (!params.id || Number.isNaN(id) || id <= 0) {
    return redirect(
      `${base}/admin/papelera?toast_msg=${encodeURIComponent("ID de registro inválido")}&toast_type=error`,
    );
  }

  const user = locals.user;
  if (!user || user.role !== "admin") {
    return redirect(
      `${base}/admin/papelera?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`,
    );
  }

  const result = await restoreRecord(id, user.username || "Sistema");
  if (result.ok) {
    const renamed = result.renamedFields?.length
      ? ` (campos renombrados: ${result.renamedFields.join(", ")})`
      : "";
    return redirect(
      `${base}/admin/papelera?toast_msg=${encodeURIComponent(`Registro restaurado con éxito.${renamed}`)}&toast_type=success`,
    );
  }

  return redirect(
    `${base}/admin/papelera?toast_msg=${encodeURIComponent(result.error ?? "Error al restaurar el registro")}&toast_type=error`,
  );
};
