import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, schedules, agentSaturdayGroups, saturdayRotationConfig } from "@db/schema";
import { and, eq, like, inArray, desc, lt } from "drizzle-orm";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

const MONTH_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { year, month } = body; // month is 0-indexed (0 = Enero)

    if (year === undefined || month === undefined) {
      return jsonResponse({ error: "Year and month are required" }, 400);
    }

    // 1. Fetch all agents with legacy saturday fields
    const dbAgents = await db.select({
      id: agents.id,
      name: agents.name,
      saturdayGroup: agents.saturdayGroup,
      saturdayHorario: agents.saturdayHorario
    }).from(agents);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 2. Load all historical agentSaturdayGroups records to find each operator's most recent non-null group
    const allPrevRecords = await db
      .select()
      .from(agentSaturdayGroups)
      .where(lt(agentSaturdayGroups.month, monthPrefix))
      .orderBy(desc(agentSaturdayGroups.month));

    const effectivePrevGroups = new Map<number, typeof agentSaturdayGroups.$inferSelect>();
    for (const record of allPrevRecords) {
      if (!effectivePrevGroups.has(record.agentId) && record.saturdayGroup) {
        effectivePrevGroups.set(record.agentId, record);
      }
    }

    // 4. Build insert records for each agent (only if they have a non-empty Saturday group)
    const agentSaturdayGroupInserts = dbAgents
      .map(agent => {
        const prevConfig = effectivePrevGroups.get(agent.id);
        const sg = prevConfig?.saturdayGroup || agent.saturdayGroup;
        const sh = prevConfig?.saturdayHorario || agent.saturdayHorario;
        return sg
          ? { agentId: agent.id, month: monthPrefix, saturdayGroup: sg, saturdayHorario: sh || null }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Handle saturdayRotationConfig copy
    const targetRotationConfig = await db.select().from(saturdayRotationConfig).where(eq(saturdayRotationConfig.month, monthPrefix)).limit(1);
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
        };
      }
    }

    // 5. Transaction: Delete existing, insert schedules, insert agentSaturdayGroups, upsert saturdayRotationConfig
    await db.transaction((tx) => {
      // 5.1 Batch delete schedules
      tx.delete(schedules).where(
        and(
          inArray(schedules.agentName, dbAgents.map(a => a.name)),
          like(schedules.date, `${monthPrefix}-%`)
        )
      ).run();

      // 5.2 Chunk-insert schedules
      const allInserts = [];
      for (const op of dbAgents) {
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          allInserts.push({
            agentName: op.name,
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
        tx.insert(schedules).values(allInserts.slice(i, i + CHUNK_SIZE)).run();
      }

      // 5.3 Delete existing agentSaturdayGroups for target month
      tx.delete(agentSaturdayGroups).where(eq(agentSaturdayGroups.month, monthPrefix)).run();

      // 5.4 Chunk-insert new agentSaturdayGroups records
      if (agentSaturdayGroupInserts.length > 0) {
        for (let i = 0; i < agentSaturdayGroupInserts.length; i += CHUNK_SIZE) {
          tx.insert(agentSaturdayGroups).values(agentSaturdayGroupInserts.slice(i, i + CHUNK_SIZE)).run();
        }
      }

      // 5.5 Upsert saturdayRotationConfig
      if (rotationConfigInsert) {
        tx.insert(saturdayRotationConfig).values(rotationConfigInsert).run();
      }
    });

    await logAdminFromAstro(locals,
      `Generó el cronograma del mes ${MONTH_LABELS[month] || month} ${year}`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("POST Months API Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { year, month } = body; // month is 0-indexed (0 = Enero)

    if (year === undefined || month === undefined) {
      return jsonResponse({ error: "Year and month are required" }, 400);
    }

    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Transaction for atomic delete
    await db.transaction((tx) => {
      tx.delete(schedules).where(
        like(schedules.date, `${monthPrefix}-%`)
      ).run();

      tx.delete(agentSaturdayGroups).where(
        eq(agentSaturdayGroups.month, monthPrefix)
      ).run();
    });

    await logAdminFromAstro(locals,
      `Eliminó el cronograma del mes de ${MONTH_LABELS[month] || month} ${year}`
    );

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("DELETE Months API Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
