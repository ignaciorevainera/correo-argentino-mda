import type { APIRoute } from "astro";
import { db } from "@db/index";
import { operatorAttendance } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { getAttendanceData, calculateCompliance } from "@lib/attendance";
import { requireReadAccess, requireWriteAccess } from "@lib/rbac-middleware";
import { logAdminAction } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";

export { calculateCompliance };

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireReadAccess(locals, "asistencia");
  if (denied) return denied;
  try {
    const startDate = url.searchParams.get("startDate") || url.searchParams.get("date");

    if (!startDate) {
      return jsonResponse({ error: "Missing date parameter" }, 400);
    }

    const endDate = url.searchParams.get("endDate") || startDate;
    const responseData = await getAttendanceData(startDate, endDate);

    return jsonResponse(responseData, 200, "no-store, no-cache, must-revalidate");
  } catch (error: any) {
    console.error("GET Attendance API Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asistencia");
  if (denied) return denied;
  try {
    const body = await request.json();
    const { date, edits } = body;

    if (!Array.isArray(edits)) {
      return jsonResponse({ error: "Missing edits array" }, 400);
    }

    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const currentYear = parseInt(todayStr.split("-")[0]);

    for (const edit of edits) {
      const editDate = edit.date || date;
      
      if (!editDate) {
        return jsonResponse({ error: "Falta la fecha de registro" }, 400);
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
        return jsonResponse({ error: `Formato de fecha inválido: ${editDate}` }, 400);
      }

      const dateParts = editDate.split("-").map(Number);
      const parsedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      if (
        parsedDate.getFullYear() !== dateParts[0] ||
        parsedDate.getMonth() !== dateParts[1] - 1 ||
        parsedDate.getDate() !== dateParts[2]
      ) {
        return jsonResponse({ error: `Fecha inexistente en el calendario: ${editDate}` }, 400);
      }

      if (editDate > todayStr) {
        return jsonResponse({ error: `No se permite registrar asistencia para fechas futuras: ${editDate}` }, 400);
      }

      if (dateParts[0] !== currentYear) {
        return jsonResponse({ error: `El registro histórico para el año ${dateParts[0]} está cerrado: ${editDate}` }, 400);
      }
    }

    await db.transaction((tx) => {
      for (const edit of edits) {
        const {
          agentId,
          asistencia,
          ausencia,
          entradaReal,
          cumplimiento,
          cumplimientoForzado,
          motivoLoguin,
          detalle,
        } = edit;

        const editDate = edit.date || date;
        if (!agentId) continue;

        const existing = tx
          .select()
          .from(operatorAttendance)
          .where(
            and(
              eq(operatorAttendance.agentId, agentId),
              eq(operatorAttendance.date, editDate)
            )
          )
          .limit(1)
          .all();

        if (existing.length > 0) {
          const updateData: any = {};
          if (asistencia !== undefined) updateData.asistencia = asistencia;
          if (ausencia !== undefined) updateData.ausencia = ausencia;
          if (entradaReal !== undefined) updateData.entradaReal = entradaReal;
          if (cumplimiento !== undefined) updateData.cumplimiento = cumplimiento;
          if (cumplimientoForzado !== undefined) updateData.cumplimientoForzado = !!cumplimientoForzado;
          if (motivoLoguin !== undefined) updateData.motivoLoguin = motivoLoguin;
          if (detalle !== undefined) updateData.detalle = detalle;

          if (Object.keys(updateData).length > 0) {
            tx
              .update(operatorAttendance)
              .set(updateData)
              .where(eq(operatorAttendance.id, existing[0].id))
              .run();
          }
        } else {
          tx.insert(operatorAttendance).values({
            agentId,
            date: editDate,
            asistencia: asistencia || "",
            ausencia: ausencia || "",
            entradaReal: entradaReal || "",
            cumplimiento: cumplimiento || "",
            cumplimientoForzado: !!cumplimientoForzado,
            motivoLoguin: motivoLoguin || "",
            detalle: detalle || "",
          }).run();
        }
      }
    });

    await logAdminAction(
      (locals as any).user?.username || 'Sistema',
      `Guardó asistencias del ${date || edits[0]?.date} (${edits.length} registros)`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Attendance API Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
