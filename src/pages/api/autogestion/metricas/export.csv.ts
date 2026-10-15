import type { APIRoute } from "astro";
import { requireReadAccess } from "@lib/rbac-middleware";
import { jsonError } from "@lib/apiResponse";
import { db } from "@db/index";
import { assignmentHistory } from "@db/schema";
import { gte, lte, and, desc } from "drizzle-orm";
import { parseDateRange, generateCsvExport } from "@/lib/autogestion/metricasService";

export const GET: APIRoute = async ({ request, locals }) => {
  const authError = await requireReadAccess(locals, "asignacion_ag");
  if (authError) return authError;

  const url = new URL(request.url);
  const preset = url.searchParams.get("preset") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;

  try {
    const range = parseDateRange(preset, from, to);

    const records = await db
      .select()
      .from(assignmentHistory)
      .where(
        and(
          gte(assignmentHistory.assignedAt, range.fromMs),
          lte(assignmentHistory.assignedAt, range.toMs)
        )
      )
      .orderBy(desc(assignmentHistory.assignedAt));

    const csvContent = generateCsvExport(records);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `autogestiones_asignadas_${dateStr}.csv`;

    return new Response("\uFEFF" + csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Error exporting autogestiones csv:", err);
    return jsonError("Error al generar el archivo de exportación", 500);
  }
};
