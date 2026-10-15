import type { APIRoute } from "astro";
import { db } from "@db/index";
import {
  agents,
  schedules,
  weekendOvertimeShifts,
  workLocations,
} from "@db/schema";
import { eq, and } from "drizzle-orm";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { buildNameToAgentId, resolveAgentIdByName } from "@lib/scheduleLinks";
import {
  buildCronogramaPayload,
  listAvailableMonths,
  resolveCronogramaMonth,
} from "@lib/cronograma/payload";

export const GET: APIRoute = async ({ url }) => {
  try {
    const availableMonths = await listAvailableMonths();
    const activeMonth = resolveCronogramaMonth(
      url.searchParams.get("month"),
      availableMonths,
    );

    return jsonResponse(
      await buildCronogramaPayload(activeMonth, availableMonths),
      200,
      "no-store, no-cache, must-revalidate",
    );
  } catch (error: any) {
    console.error("GET API Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { edits, weeklySchedules } = body; // edits: Array of { agentId?, agentName?, date, status, comment, horario, breakInicio, breakFin } (agentId es la clave preferida; agentName es fallback) + weeklySchedules opcionales

    let weeklyCount = 0;

    if (weeklySchedules && Array.isArray(weeklySchedules)) {
      weeklyCount = weeklySchedules.length;
      for (const ws of weeklySchedules) {
        const {
          agentId,
          agentName,
          esquema_semanal,
          esquema_horario,
          esquema_break_inicio,
          esquema_break_fin,
        } = ws;
        const agentIdNum =
          agentId != null && agentId !== "" ? Number(agentId) : undefined;
        if (agentIdNum !== undefined && !Number.isInteger(agentIdNum)) {
          return jsonResponse({ error: "agentId inválido." }, 400);
        }
        if (agentIdNum == null && !agentName) continue;

        const updateData: any = {};
        if (esquema_semanal !== undefined) {
          updateData.esquemaSemanal = esquema_semanal;
        }
        if (esquema_horario !== undefined) {
          updateData.esquemaHorario = esquema_horario;
        }
        if (esquema_break_inicio !== undefined) {
          updateData.esquemaBreakInicio = esquema_break_inicio;
        }
        if (esquema_break_fin !== undefined) {
          updateData.esquemaBreakFin = esquema_break_fin;
        }

        if (Object.keys(updateData).length > 0) {
          if (agentIdNum != null) {
            await db
              .update(agents)
              .set(updateData)
              .where(eq(agents.id, agentIdNum));
          } else {
            await db
              .update(agents)
              .set(updateData)
              .where(eq(agents.name, agentName));
          }
        }
      }

      if (!edits || !Array.isArray(edits)) {
        await logAdminFromAstro(
          locals,
          `Actualizó esquemas semanales de ${weeklyCount} operadores`,
        );
        return jsonResponse({
          success: true,
          message: "Weekly schedules updated",
        });
      }
    }

    if (!Array.isArray(edits)) {
      return jsonResponse({ error: "Edits must be an array" }, 400);
    }

    // Process each edit atomically inside a transaction (Transactions for Batch Edits)
    // Map nombre->id cargado fuera del tx (better-sqlite3 exige callbacks sincronos).
    const dbAgentsPost = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents);
    const nameToAgentIdPost = buildNameToAgentId(dbAgentsPost);
    const knownAgentIdsPost = new Set(dbAgentsPost.map((a) => a.id));
    // Normalizar agentId (JSON puede traerlo como string) y validar antes del
    // tx: dentro del callback no se puede retornar un 400 (better-sqlite3
    // exige callbacks sincronos y el return no saldria del handler).
    for (const edit of edits) {
      const rawEditAgentId = edit?.agentId;
      const coerced =
        rawEditAgentId != null && rawEditAgentId !== ""
          ? Number(rawEditAgentId)
          : undefined;
      if (coerced !== undefined && !Number.isInteger(coerced)) {
        return jsonResponse({ error: "agentId inválido." }, 400);
      }
      edit.agentId = coerced;
    }
    let saved = 0;
    let skipped = 0;
    await db.transaction((tx) => {
      for (const edit of edits) {
        const {
          agentId,
          agentName,
          date,
          status,
          comment,
          horario,
          breakInicio,
          breakFin,
        } = edit;
        // agentId ya viene normalizado (pre-tx); la guarda usa nullish exacto.
        const agentIdNum =
          agentId != null && agentId !== "" ? Number(agentId) : undefined;
        if (!date) {
          skipped++;
          continue;
        }
        // Un agentId desconocido no es vinculable: se intenta resolver por
        // nombre (compat de payload) y, si no resuelve, el edit se omite.
        // schedules ya no guarda nombre: solo se inserta un id existente.
        const resolvedAgentId =
          agentIdNum != null && knownAgentIdsPost.has(agentIdNum)
            ? agentIdNum
            : resolveAgentIdByName(nameToAgentIdPost, agentName).agentId;
        if (resolvedAgentId == null) {
          skipped++;
          continue;
        }

        // Limpieza automática de horas extras si es fin de semana y el estado es Vacaciones o Licencia
        const dateObj = new Date(date + "T12:00:00");
        const isWeekendDay = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        if (
          isWeekendDay &&
          (status === "Licencia" || status === "Vacaciones")
        ) {
          tx.delete(weekendOvertimeShifts)
            .where(
              and(
                eq(weekendOvertimeShifts.agentId, resolvedAgentId),
                eq(weekendOvertimeShifts.date, date),
              ),
            )
            .run();
        }

        const existing = tx
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.agentId, resolvedAgentId),
              eq(schedules.date, date),
            ),
          )
          .limit(1)
          .all();

        if (existing.length > 0) {
          const updateData: any = {};
          if (status !== undefined) updateData.status = status;
          if (comment !== undefined) updateData.comment = comment;
          if (horario !== undefined) updateData.horario = horario;
          if (breakInicio !== undefined) updateData.breakInicio = breakInicio;
          if (breakFin !== undefined) updateData.breakFin = breakFin;
          updateData.isOverride = true;
          updateData.agentId = resolvedAgentId;

          tx.update(schedules)
            .set(updateData)
            .where(eq(schedules.id, existing[0].id))
            .run();
          saved++;
        } else {
          tx.insert(schedules)
            .values({
              agentId: resolvedAgentId,
              date,
              status: status !== undefined ? status : "Franco",
              comment: comment || "",
              horario: horario || "",
              breakInicio: breakInicio || "",
              breakFin: breakFin || "",
              isOverride: true,
            })
            .run();
          saved++;
        }
      }
    });

    const editCount = edits?.length || 0;
    let logMessages: string[] = [];
    if (weeklyCount > 0) {
      logMessages.push(
        `Actualizó esquemas semanales de ${weeklyCount} operadores`,
      );
    }
    if (editCount > 0) {
      logMessages.push(
        `Guardó cambios en el cronograma (${saved} registros${skipped > 0 ? `, ${skipped} omitidos` : ""})`,
      );
    }
    if (logMessages.length > 0) {
      await logAdminFromAstro(locals, logMessages.join(" y "));
    }

    return jsonResponse({
      success: true,
      saved,
      skipped,
      message: `Guardó ${saved} cambios en el cronograma${skipped > 0 ? ` (${skipped} omitidos)` : ""}`,
    });
  } catch (error: any) {
    console.error("POST API Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { edits, weeklySchedules } = body;

    const allLocations = await db
      .select({ id: workLocations.id, name: workLocations.name })
      .from(workLocations)
      .orderBy(workLocations.name);

    let weeklyCount = 0;

    if (weeklySchedules && Array.isArray(weeklySchedules)) {
      weeklyCount = weeklySchedules.length;
      for (const ws of weeklySchedules) {
        const {
          agentId,
          agentName,
          esquema_semanal,
          esquema_horario,
          esquema_break_inicio,
          esquema_break_fin,
          locationId,
        } = ws;
        const agentIdNum =
          agentId != null && agentId !== "" ? Number(agentId) : undefined;
        if (agentIdNum !== undefined && !Number.isInteger(agentIdNum)) {
          return jsonResponse({ error: "agentId inválido." }, 400);
        }
        if (agentIdNum == null && !agentName) continue;

        const updateData: any = {};
        if (esquema_semanal !== undefined) {
          updateData.esquemaSemanal = esquema_semanal;
        }
        if (esquema_horario !== undefined) {
          updateData.esquemaHorario = esquema_horario;
        }
        if (esquema_break_inicio !== undefined) {
          updateData.esquemaBreakInicio = esquema_break_inicio;
        }
        if (esquema_break_fin !== undefined) {
          updateData.esquemaBreakFin = esquema_break_fin;
        }
        if (
          locationId !== undefined &&
          locationId !== null &&
          locationId !== ""
        ) {
          const loc = allLocations.find((l) => l.id === String(locationId));
          updateData.location = loc ? loc.name : "Monte Grande";
        }

        if (Object.keys(updateData).length > 0) {
          if (agentIdNum != null) {
            await db
              .update(agents)
              .set(updateData)
              .where(eq(agents.id, agentIdNum));
          } else {
            await db
              .update(agents)
              .set(updateData)
              .where(eq(agents.name, agentName));
          }
        }
      }

      if (!edits || !Array.isArray(edits)) {
        await logAdminFromAstro(
          locals,
          `Actualizó esquemas semanales de ${weeklyCount} operadores`,
        );
        return jsonResponse({
          success: true,
          message: "Weekly schedules updated",
        });
      }
    }

    if (!Array.isArray(edits)) {
      return jsonResponse({ error: "Edits must be an array" }, 400);
    }

    // Map nombre->id cargado fuera del tx (better-sqlite3 exige callbacks sincronos).
    const dbAgentsPut = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents);
    const nameToAgentIdPut = buildNameToAgentId(dbAgentsPut);
    const knownAgentIdsPut = new Set(dbAgentsPut.map((a) => a.id));
    // Normalizar agentId (JSON puede traerlo como string) y validar antes del
    // tx: dentro del callback no se puede retornar un 400 (better-sqlite3
    // exige callbacks sincronos y el return no saldria del handler).
    for (const edit of edits) {
      const rawEditAgentId = edit?.agentId;
      const coerced =
        rawEditAgentId != null && rawEditAgentId !== ""
          ? Number(rawEditAgentId)
          : undefined;
      if (coerced !== undefined && !Number.isInteger(coerced)) {
        return jsonResponse({ error: "agentId inválido." }, 400);
      }
      edit.agentId = coerced;
    }
    let saved = 0;
    let skipped = 0;
    await db.transaction((tx) => {
      for (const edit of edits) {
        const {
          agentId,
          agentName,
          date,
          status,
          comment,
          horario,
          breakInicio,
          breakFin,
        } = edit;
        // agentId ya viene normalizado (pre-tx); la guarda usa nullish exacto.
        const agentIdNum =
          agentId != null && agentId !== "" ? Number(agentId) : undefined;
        if (!date) {
          skipped++;
          continue;
        }
        // Un agentId desconocido no es vinculable: se intenta resolver por
        // nombre (compat de payload) y, si no resuelve, el edit se omite.
        // schedules ya no guarda nombre: solo se inserta un id existente.
        const resolvedAgentId =
          agentIdNum != null && knownAgentIdsPut.has(agentIdNum)
            ? agentIdNum
            : resolveAgentIdByName(nameToAgentIdPut, agentName).agentId;
        if (resolvedAgentId == null) {
          skipped++;
          continue;
        }

        const dateObj = new Date(date + "T12:00:00");
        const isWeekendDay = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        if (
          isWeekendDay &&
          (status === "Licencia" || status === "Vacaciones")
        ) {
          tx.delete(weekendOvertimeShifts)
            .where(
              and(
                eq(weekendOvertimeShifts.agentId, resolvedAgentId),
                eq(weekendOvertimeShifts.date, date),
              ),
            )
            .run();
        }

        const existing = tx
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.agentId, resolvedAgentId),
              eq(schedules.date, date),
            ),
          )
          .limit(1)
          .all();

        if (existing.length > 0) {
          const updateData: any = {};
          if (status !== undefined) updateData.status = status;
          if (comment !== undefined) updateData.comment = comment;
          if (horario !== undefined) updateData.horario = horario;
          if (breakInicio !== undefined) updateData.breakInicio = breakInicio;
          if (breakFin !== undefined) updateData.breakFin = breakFin;
          updateData.isOverride = true;
          updateData.agentId = resolvedAgentId;

          tx.update(schedules)
            .set(updateData)
            .where(eq(schedules.id, existing[0].id))
            .run();
          saved++;
        } else {
          tx.insert(schedules)
            .values({
              agentId: resolvedAgentId,
              date,
              status: status !== undefined ? status : "Franco",
              comment: comment || "",
              horario: horario || "",
              breakInicio: breakInicio || "",
              breakFin: breakFin || "",
              isOverride: true,
            })
            .run();
          saved++;
        }
      }
    });

    const editCount = edits?.length || 0;
    let logMessages: string[] = [];
    if (weeklyCount > 0) {
      logMessages.push(
        `Actualizó esquemas semanales de ${weeklyCount} operadores`,
      );
    }
    if (editCount > 0) {
      logMessages.push(
        `Guardó cambios en el cronograma (${saved} registros${skipped > 0 ? `, ${skipped} omitidos` : ""})`,
      );
    }
    if (logMessages.length > 0) {
      await logAdminFromAstro(locals, logMessages.join(" y "));
    }

    return jsonResponse({
      success: true,
      saved,
      skipped,
      message: `Guardó ${saved} cambios en el cronograma${skipped > 0 ? ` (${skipped} omitidos)` : ""}`,
    });
  } catch (error: any) {
    console.error("PUT API Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
