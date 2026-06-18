import type { APIRoute } from "astro";
import { db } from "@/db";
import { operatorAttendance } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAttendanceData, calculateCompliance } from "@/lib/attendance";
import { requireReadAccess, requireWriteAccess } from "@/lib/rbac-middleware";

export { calculateCompliance };

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireReadAccess(locals, "asistencia");
  if (denied) return denied;
  try {
    const startDate = url.searchParams.get("startDate") || url.searchParams.get("date");

    if (!startDate) {
      return new Response(JSON.stringify({ error: "Missing date parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const endDate = url.searchParams.get("endDate") || startDate;
    const responseData = await getAttendanceData(startDate, endDate);

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Attendance API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "asistencia");
  if (denied) return denied;
  try {
    const body = await request.json();
    const { date, edits } = body;

    if (!Array.isArray(edits)) {
      return new Response(JSON.stringify({ error: "Missing edits array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Date validation setup
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const currentYear = parseInt(todayStr.split("-")[0]);

    // 1. First validate all edits to ensure atomic integrity
    for (const edit of edits) {
      const editDate = edit.date || date;
      
      if (!editDate) {
        return new Response(JSON.stringify({ error: "Falta la fecha de registro" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Format check (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
        return new Response(JSON.stringify({ error: `Formato de fecha inválido: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Real calendar date check
      const dateParts = editDate.split("-").map(Number);
      const parsedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      if (
        parsedDate.getFullYear() !== dateParts[0] ||
        parsedDate.getMonth() !== dateParts[1] - 1 ||
        parsedDate.getDate() !== dateParts[2]
      ) {
        return new Response(JSON.stringify({ error: `Fecha inexistente en el calendario: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Future date block
      if (editDate > todayStr) {
        return new Response(JSON.stringify({ error: `No se permite registrar asistencia para fechas futuras: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Closed year check
      if (dateParts[0] !== currentYear) {
        return new Response(JSON.stringify({ error: `El registro histórico para el año ${dateParts[0]} está cerrado: ${editDate}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2. Perform updates
    db.transaction((tx) => {
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST Attendance API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
