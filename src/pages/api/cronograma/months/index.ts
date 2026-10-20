import type { APIRoute } from "astro";
import { db } from "@db/index";
import {
  agents,
  schedules,
  agentSaturdayGroups,
  saturdayRotationConfig,
  users,
} from "@db/schema";
import { and, eq, like, inArray, desc, lt } from "drizzle-orm";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { activeCronogramaAgentCondition } from "@lib/activeUsers";

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type ParsedMonth = {
  year: number;
  month: number;
  monthPrefix: string;
};

function parseYearMonth(body: unknown): ParsedMonth | null {
  const { year: rawYear, month: rawMonth } = (body ?? {}) as {
    year?: unknown;
    month?: unknown;
  };

  if (typeof rawYear !== "number" || typeof rawMonth !== "number") {
    return null;
  }

  const year = rawYear;
  const month = rawMonth;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11
  ) {
    return null;
  }

  return {
    year,
    month,
    monthPrefix: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const parsed = parseYearMonth(await request.json());
    if (!parsed) {
      return jsonError(
        "Year y month son requeridos y deben ser válidos (month 0-11)",
        400,
      );
    }
    const { year, month, monthPrefix } = parsed;

    // Guard: este flujo solo crea meses nuevos. Re-crear un mes existente
    // borraría sus ediciones/overrides (la transacción de abajo hace
    // delete+reinsert). Cortar antes de cualquier escritura. Para regenerar
    // hay que eliminar primero el mes con DELETE.
    const [existingSchedule] = await db
      .select({ id: schedules.id })
      .from(schedules)
      .where(like(schedules.date, `${monthPrefix}-%`))
      .limit(1);
    const [existingRotation] = await db
      .select({ month: saturdayRotationConfig.month })
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, monthPrefix))
      .limit(1);
    if (existingSchedule || existingRotation) {
      return jsonResponse(
        {
          error: `El mes ${monthPrefix} ya existe. Para regenerarlo, primero eliminá el mes existente.`,
        },
        409,
      );
    }

    // 1. Fetch all agents with legacy saturday fields
    const dbAgents = await db
      .select({
        id: agents.id,
        saturdayGroup: agents.saturdayGroup,
        saturdayHorario: agents.saturdayHorario,
      })
      .from(agents)
      .leftJoin(users, eq(users.id, agents.userId))
      .where(activeCronogramaAgentCondition());

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 2. Load all historical agentSaturdayGroups records to find each operator's most recent non-null group
    const allPrevRecords = await db
      .select()
      .from(agentSaturdayGroups)
      .where(lt(agentSaturdayGroups.month, monthPrefix))
      .orderBy(desc(agentSaturdayGroups.month));

    const effectivePrevGroups = new Map<
      number,
      typeof agentSaturdayGroups.$inferSelect
    >();
    for (const record of allPrevRecords) {
      if (!effectivePrevGroups.has(record.agentId) && record.saturdayGroup) {
        effectivePrevGroups.set(record.agentId, record);
      }
    }

    // 4. Build insert records for each agent (only if they have a non-empty Saturday group)
    const agentSaturdayGroupInserts = dbAgents
      .map((agent) => {
        const prevConfig = effectivePrevGroups.get(agent.id);
        const sg = prevConfig?.saturdayGroup || agent.saturdayGroup;
        const sh = prevConfig?.saturdayHorario || agent.saturdayHorario;
        return sg
          ? {
              agentId: agent.id,
              month: monthPrefix,
              saturdayGroup: sg,
              saturdayHorario: sh || null,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Copy saturdayRotationConfig from the nearest previous month. El guard
    // 409 ya garantiza que no existe config para este mes, así que siempre se
    // copia la más reciente anterior.
    const prevRotationConfigResult = await db
      .select()
      .from(saturdayRotationConfig)
      .where(lt(saturdayRotationConfig.month, monthPrefix))
      .orderBy(desc(saturdayRotationConfig.month))
      .limit(1);

    const prevRotationConfig = prevRotationConfigResult[0];
    let rotationConfigInsert = null;
    if (prevRotationConfig) {
      rotationConfigInsert = {
        month: monthPrefix,
        rotationOrder: prevRotationConfig.rotationOrder,
        startDate: prevRotationConfig.startDate,
        startGroup: prevRotationConfig.startGroup,
        disabledGroups: "",
      };
    }

    // 5. Transaction: Delete existing, insert schedules, insert agentSaturdayGroups, upsert saturdayRotationConfig
    await db.transaction((tx) => {
      // 5.1 Batch delete schedules (por agentId: los nombres stale no
      // pueden dejar filas huérfanas en el mes)
      tx.delete(schedules)
        .where(
          and(
            inArray(
              schedules.agentId,
              dbAgents.map((a) => a.id),
            ),
            like(schedules.date, `${monthPrefix}-%`),
          ),
        )
        .run();

      // 5.2 Chunk-insert schedules
      const allInserts = [];
      for (const op of dbAgents) {
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          allInserts.push({
            agentId: op.id,
            date: dateStr,
            status: "Franco",
            comment: "",
            horario: "",
            entradaReal: "",
            salidaReal: "",
            breakInicio: "",
            breakFin: "",
            isOverride: false,
          });
        }
      }

      const CHUNK_SIZE = 100;
      for (let i = 0; i < allInserts.length; i += CHUNK_SIZE) {
        tx.insert(schedules)
          .values(allInserts.slice(i, i + CHUNK_SIZE))
          .run();
      }

      // 5.3 Delete existing agentSaturdayGroups for target month
      tx.delete(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.month, monthPrefix))
        .run();

      // 5.4 Chunk-insert new agentSaturdayGroups records
      if (agentSaturdayGroupInserts.length > 0) {
        for (let i = 0; i < agentSaturdayGroupInserts.length; i += CHUNK_SIZE) {
          tx.insert(agentSaturdayGroups)
            .values(agentSaturdayGroupInserts.slice(i, i + CHUNK_SIZE))
            .run();
        }
      }

      // 5.5 Upsert saturdayRotationConfig
      if (rotationConfigInsert) {
        tx.insert(saturdayRotationConfig).values(rotationConfigInsert).run();
      }
    });

    await logAdminFromAstro(
      locals,
      `Generó el cronograma del mes ${MONTH_LABELS[month] || month} ${year}`,
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Months API Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const parsed = parseYearMonth(await request.json());
    if (!parsed) {
      return jsonError(
        "Year y month son requeridos y deben ser válidos (month 0-11)",
        400,
      );
    }
    const { year, month, monthPrefix } = parsed;

    // Transaction for atomic delete
    await db.transaction((tx) => {
      tx.delete(schedules)
        .where(like(schedules.date, `${monthPrefix}-%`))
        .run();

      tx.delete(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.month, monthPrefix))
        .run();

      // También la config de rotación: si sobrevive, el guard 409 del POST
      // impide recrear el mes recién eliminado.
      tx.delete(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, monthPrefix))
        .run();
    });

    await logAdminFromAstro(
      locals,
      `Eliminó el cronograma del mes de ${MONTH_LABELS[month] || month} ${year}`,
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("DELETE Months API Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
