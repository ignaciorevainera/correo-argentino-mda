/**
 * Datos de las cards nuevas del home por perfil (calidad de equipo,
 * automatizaciones, sugerencias, auditoría y usuarios).
 *
 * Todo se resuelve contra la base local: sin llamadas a InvGate/Wise.
 */
import { db } from "@db/index";
import {
  auditLogs,
  feedback,
  qualityAudits,
  users,
} from "@db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { calculateOperatorChannelStats } from "@lib/qualityCalculator";
import { MONTH_LABELS } from "@lib/monthUtils";
import { getAutomationMetrics } from "@lib/workflow/metrics";
import { getUnassignedEmployeesCount } from "@lib/employeeQueries";

export interface QualityTeamSummary {
  monthLabel: string;
  average: number;
  auditsCount: number;
  operators: number;
  belowThreshold: number;
}

export async function getQualityTeamSummary(
  ref: Date = new Date(),
): Promise<QualityTeamSummary> {
  const month = `${String(ref.getMonth() + 1).padStart(2, "0")}-${ref.getFullYear()}`;

  const rows = await db
    .select({
      agentId: qualityAudits.agentId,
      channelType: qualityAudits.channelType,
      totalScore: qualityAudits.totalScore,
    })
    .from(qualityAudits)
    .where(eq(qualityAudits.month, month));

  const byAgent = new Map<
    number,
    { channelType: string | null; totalScore: number }[]
  >();
  for (const row of rows) {
    const list = byAgent.get(row.agentId);
    const item = { channelType: row.channelType, totalScore: row.totalScore };
    if (list) list.push(item);
    else byAgent.set(row.agentId, [item]);
  }

  const averages = Array.from(byAgent.values()).map(
    (audits) => calculateOperatorChannelStats(audits).globalAverage,
  );
  const average =
    averages.length > 0
      ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length)
      : 0;

  return {
    monthLabel: `${MONTH_LABELS[month.slice(0, 2)] ?? month.slice(0, 2)} ${ref.getFullYear()}`,
    average,
    auditsCount: rows.length,
    operators: averages.length,
    belowThreshold: averages.filter((value) => value > 0 && value < 80).length,
  };
}

export interface AutomationSummary {
  active: number;
  finalized: number;
  onTimeRate: number | null;
  oldestDays: number | null;
}

export function getAutomationSummary(): AutomationSummary {
  try {
    const metrics = getAutomationMetrics({ windowDays: null });
    return {
      active: metrics.totals.active,
      finalized: metrics.totals.finalized,
      onTimeRate: metrics.sla.onTimeRate,
      oldestDays: metrics.oldestActive?.days ?? null,
    };
  } catch (error) {
    console.error("Home: no se pudieron calcular las automatizaciones", error);
    return { active: 0, finalized: 0, onTimeRate: null, oldestDays: null };
  }
}

export interface FeedbackItem {
  subject: string;
  type: string;
  createdAt: Date | null;
}

export interface FeedbackSummary {
  pending: number;
  suggestions: number;
  bugs: number;
  latest: FeedbackItem[];
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  const counts = await db
    .select({
      type: feedback.type,
      status: feedback.status,
      total: sql<number>`count(*)`,
    })
    .from(feedback)
    .groupBy(feedback.type, feedback.status);

  const pendingRows = counts.filter(
    (row) => row.status === "pendiente" || row.status === "en_revision",
  );
  const pending = pendingRows.reduce((sum, row) => sum + Number(row.total), 0);
  const suggestions = pendingRows
    .filter((row) => row.type === "sugerencia")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const bugs = pendingRows
    .filter((row) => row.type === "bug")
    .reduce((sum, row) => sum + Number(row.total), 0);

  const latest = await db
    .select({
      subject: feedback.subject,
      type: feedback.type,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .where(inArray(feedback.status, ["pendiente", "en_revision"]))
    .orderBy(desc(feedback.createdAt))
    .limit(8);

  return { pending, suggestions, bugs, latest };
}

export interface AuditLogEntry {
  username: string;
  action: string;
  timestamp: string;
}

export async function getAuditLogSummary(
  limit = 5,
): Promise<AuditLogEntry[]> {
  return db
    .select({
      username: auditLogs.username,
      action: auditLogs.action,
      timestamp: auditLogs.timestamp,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.timestamp))
    .limit(limit);
}

export interface AdminUsersSummary {
  total: number;
  inactive: number;
  unassigned: number;
}

export async function getAdminUsersSummary(): Promise<AdminUsersSummary> {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)`,
      inactive: sql<number>`sum(case when ${users.active} = 0 then 1 else 0 end)`,
    })
    .from(users);

  let unassigned = 0;
  try {
    unassigned = await getUnassignedEmployeesCount();
  } catch (error) {
    console.error("Home: no se pudo contar usuarios sin ubicación", error);
  }

  return {
    total: Number(totals?.total ?? 0),
    inactive: Number(totals?.inactive ?? 0),
    unassigned,
  };
}
