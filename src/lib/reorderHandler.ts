import { db } from "@db/index";
import { eq } from "drizzle-orm";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, jsonError } from "@lib/apiResponse";

export async function handleReorder(
  request: Request,
  locals: App.Locals,
  table: any,
  auditMessage: string | ((count: number) => string),
  options?: {
    mapItem?: (item: any) => Record<string, unknown>;
    errorLabel?: string;
  },
): Promise<Response> {
  if (!locals.user) return jsonError("No autorizado", 401);

  const body = await request.json();
  const items = body?.items;

  if (!Array.isArray(items)) return jsonError("Datos inválidos", 400);

  try {
    await db.transaction((tx) => {
      for (const item of items) {
        const data: Record<string, unknown> = { sortOrder: item.sortOrder };
        if (options?.mapItem) {
          Object.assign(data, options.mapItem(item));
        }
        tx.update(table).set(data).where(eq(table.id, item.id)).run();
      }
    });

    const msg =
      typeof auditMessage === "function"
        ? auditMessage(items.length)
        : auditMessage;

    await logAdminFromAstro(locals, msg);

    return jsonResponse({ success: true });
  } catch (err) {
    const label = options?.errorLabel ?? "Reorder";
    console.error(`[${label}] Error:`, err);
    return jsonError("Error interno al reordenar", 500);
  }
}
