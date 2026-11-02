/**
 * Score de calidad del operador para el home personalizado.
 *
 * Usa la misma fórmula que la vista de Calidad (`calculateOperatorChannelStats`:
 * promedio de los promedios por canal) y compara contra el mes anterior.
 * Ojo: `quality_audits.month` está en formato MM-YYYY.
 */
import { db } from "@db/index";
import { qualityAudits } from "@db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { calculateOperatorChannelStats } from "@lib/qualityCalculator";
import { MONTH_LABELS } from "@lib/monthUtils";

const CHANNEL_LABELS: Record<string, string> = {
  wise_call: "Llamadas",
  wise_email: "Mails",
  invgate_ticket: "Autogestión",
};

export interface QualityChannel {
  key: string;
  label: string;
  average: number;
  count: number;
}

export interface QualitySummary {
  /** Mes evaluado, formato MM-YYYY. */
  month: string;
  monthLabel: string;
  average: number;
  auditsCount: number;
  channels: QualityChannel[];
  previousAverage: number | null;
  previousCount: number;
  /** Diferencia contra el mes anterior (null si no hay mes anterior). */
  delta: number | null;
}

interface AuditLike {
  channelType?: string | null;
  totalScore?: number | null;
}

export function monthTag(ref: Date = new Date()): string {
  return `${String(ref.getMonth() + 1).padStart(2, "0")}-${ref.getFullYear()}`;
}

export function previousMonthTag(ref: Date = new Date()): string {
  return monthTag(new Date(ref.getFullYear(), ref.getMonth() - 1, 1));
}

export function formatQualityMonth(month: string): string {
  const [mm, yyyy] = month.split("-");
  return `${MONTH_LABELS[mm] ?? mm} ${yyyy}`;
}

export function summarizeQuality(
  current: AuditLike[],
  previous: AuditLike[],
  month: string,
): QualitySummary {
  const valid = (audits: AuditLike[]) =>
    audits.filter(
      (audit) => typeof audit.totalScore === "number" && audit.totalScore !== null,
    );
  const currentAudits = valid(current);
  const previousAudits = valid(previous);

  const stats = calculateOperatorChannelStats(
    currentAudits.map((audit) => ({
      channelType: audit.channelType ?? "wise_call",
      totalScore: audit.totalScore as number,
    })),
  );

  const channels: QualityChannel[] = [
    { key: "wise_call", average: stats.wiseCallsAvg, count: stats.wiseCallsCount },
    { key: "wise_email", average: stats.wiseEmailsAvg, count: stats.wiseEmailsCount },
    {
      key: "invgate_ticket",
      average: stats.invgateAgAvg,
      count: stats.invgateAgCount,
    },
  ].map((channel) => ({
    ...channel,
    label: CHANNEL_LABELS[channel.key] ?? channel.key,
  }));

  const previousAverage =
    previousAudits.length > 0
      ? calculateOperatorChannelStats(
          previousAudits.map((audit) => ({
            channelType: audit.channelType ?? "wise_call",
            totalScore: audit.totalScore as number,
          })),
        ).globalAverage
      : null;

  const average = currentAudits.length > 0 ? stats.globalAverage : 0;

  return {
    month,
    monthLabel: formatQualityMonth(month),
    average,
    auditsCount: currentAudits.length,
    channels,
    previousAverage,
    previousCount: previousAudits.length,
    delta: previousAverage === null ? null : average - previousAverage,
  };
}

export async function getQualitySummary(
  agentId: number,
  ref: Date = new Date(),
): Promise<QualitySummary> {
  const month = monthTag(ref);
  const previousMonth = previousMonthTag(ref);

  const audits = await db
    .select({
      month: qualityAudits.month,
      channelType: qualityAudits.channelType,
      totalScore: qualityAudits.totalScore,
    })
    .from(qualityAudits)
    .where(
      and(
        eq(qualityAudits.agentId, agentId),
        inArray(qualityAudits.month, [month, previousMonth]),
      ),
    );

  const current = audits.filter((audit) => audit.month === month);
  const previous = audits.filter((audit) => audit.month === previousMonth);

  return summarizeQuality(current, previous, month);
}
