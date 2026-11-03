import type { APIRoute } from "astro";
import { requireReadAccess } from "@lib/rbac-middleware";
import { jsonError } from "@lib/apiResponse";
import { getAttendanceData } from "@lib/attendance";
import { generateAttendanceExcelBuffer } from "@lib/attendanceExport";

export const GET: APIRoute = async ({ request, locals }) => {
  const denied = await requireReadAccess(locals, "asistencia");
  if (denied) return denied;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateParam || !dateRegex.test(dateParam)) {
    return jsonError("Formato de fecha inválido. Se espera YYYY-MM-DD", 400);
  }

  try {
    const data = await getAttendanceData(dateParam, dateParam);
    const xlsxBuffer = generateAttendanceExcelBuffer(data);

    const filename = `Portal MDA - Asistencia - ${dateParam}.xlsx`;

    return new Response(xlsxBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(xlsxBuffer.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error al exportar asistencia a Excel:", error);
    return jsonError("Error interno al generar el archivo Excel", 500);
  }
};
