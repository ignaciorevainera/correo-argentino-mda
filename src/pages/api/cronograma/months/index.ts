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
import { eligibleAgentsCondition } from "@lib/cronogramaAgents";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

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

import { requireWriteAccess } from "@lib/rbac-middleware";
import { parseYearMonth } from "@lib/cronogramaMonths";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = parseYearMonth(body);
    if (!parsed) {
      return jsonResponse(
        { error: "Year and month must be integers (month 0-11)" },
        400,
      );
    }
    const { year, month } = parsed;

    // 1. Fetch de agentes elegibles (en cronograma + activos). Misma
    // condición que el GET para no generar filas muertas de inactivos (#262).
    const dbAgents = await db
      .select({
        id: agents.id,
        saturdayGroup: agents.saturdayGroup,
        saturdayHorario: agents.saturdayHorario,
      })
      .from(agents)
      .leftJoin(users, eq(users.id, agents.userId))
      .where(eligibleAgentsCondition());

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = parsed.prefix;

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

    // Handle saturdayRotationConfig copy
    const targetRotationConfig = await db
      .select()
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, monthPrefix))
      .limit(1);
    let rotationConfigInsert = null;
    if (targetRotationConfig.length === 0) {
      const prevRotationConfigResult = await db
        .select()
        .from(saturdayRotationConfig)
        .where(lt(saturdayRotationConfig.month, monthPrefix))
        .orderBy(desc(saturdayRotationConfig.month))
        .limit(1);

      const prevRotationConfig = prevRotationConfigResult[0];
      if (prevRotationConfig) {
        rotationConfigInsert = {
          month: monthPrefix,
          rotationOrder: prevRotationConfig.rotationOrder,
          startDate: prevRotationConfig.startDate,
          startGroup: prevRotationConfig.startGroup,
          disabledGroups: "",
        };
      }
    }

    // 5. Transaction: guard de existencia + delete/insert atómicos.
    // El guard corre DENTRO del tx (better-sqlite3 es síncrono y de una sola
    // conexión): dos POST concurrentes al mismo mes no pueden intercalarse
    // entre el SELECT del guard y las escrituras (#274).
    const MONTH_EXISTS = "CRONO_MONTH_EXISTS";
    try {
      await db.transaction((tx) => {
        const existingSchedule = tx
          .select({ id: schedules.id })
          .from(schedules)
          .where(like(schedules.date, `${monthPrefix}-%`))
          .limit(1)
          .all();
        const existingGroup = tx
          .select({ id: agentSaturdayGroups.id })
          .from(agentSaturdayGroups)
          .where(eq(agentSaturdayGroups.month, monthPrefix))
          .limit(1)
          .all();
        const existingRotation = tx
          .select({ id: saturdayRotationConfig.id })
          .from(saturdayRotationConfig)
          .where(eq(saturdayRotationConfig.month, monthPrefix))
          .limit(1)
          .all();
        // Definición única de "mes existente" (#273): schedules OR grupos OR rotación.
        if (
          existingSchedule.length ||
          existingGroup.length ||
          existingRotation.length
        ) {
          throw new Error(MONTH_EXISTS);
        }

        // 5.1 Batch delete schedules
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
    } catch (error: any) {
      if (error?.message === MONTH_EXISTS) {
        return jsonResponse(
          {
            error:
              "El mes ya existe en los registros. No se puede volver a crear para evitar pérdida de datos.",
          },
          409,
        );
      }
      throw error;
    }

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
    const body = await request.json();
    const parsed = parseYearMonth(body);
    if (!parsed) {
      return jsonResponse(
        { error: "Year and month must be integers (month 0-11)" },
        400,
      );
    }
    const { year, month } = parsed;
    const monthPrefix = parsed.prefix;

    // Transaction for atomic delete
    await db.transaction((tx) => {
      tx.delete(schedules)
        .where(like(schedules.date, `${monthPrefix}-%`))
        .run();

      tx.delete(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.month, monthPrefix))
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
