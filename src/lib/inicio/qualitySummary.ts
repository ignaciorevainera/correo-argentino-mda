/**
 * Score de calidad del operador para el home personalizado.
 *
 * Usa la misma fórmula que la vista de Calidad (`calculateOperatorChannelStats`:
 * promedio de los promedios por canal). Muestra el mes más reciente con
 * auditorías publicadas dentro de los últimos 3 meses y, si hay datos del mes
 * anterior a ese, calcula el delta.
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
  status?: string | null;
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
      (audit) => typeof audit.totalScore === "number" && audit.totalScore !== null && audit.status === "published",
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

/**
 * Auditorías (ya filtradas por `published`) de un mes concreto.
 */
export interface MonthlyQualityAudits {
  month: string;
  audits: AuditLike[];
}

/**
 * Resuelve el resumen a mostrar a partir de los últimos meses, ordenados del
 * más reciente al más viejo. Devuelve el mes más reciente con auditorías
 * publicadas e indica a qué mes corresponde. El delta compara contra el mes
 * inmediatamente anterior de la lista (null si ese mes no tiene datos).
 * Si ningún mes tiene auditorías, devuelve un resumen vacío del mes actual.
 */
export function resolveQualitySummary(
  months: MonthlyQualityAudits[],
  currentMonth: string,
): QualitySummary {
  const idx = months.findIndex((entry) => entry.audits.length > 0);
  if (idx === -1) return summarizeQuality([], [], currentMonth);

  const display = months[idx];
  const prior = months[idx + 1];
  return summarizeQuality(display.audits, prior?.audits ?? [], display.month);
}

export async function getQualitySummary(
  agentId: number,
  ref: Date = new Date(),
): Promise<QualitySummary> {
  const month = monthTag(ref);
  const previousMonth = previousMonthTag(ref);
  const previous2Month = monthTag(
    new Date(ref.getFullYear(), ref.getMonth() - 2, 1),
  );
  const monthTags = [month, previousMonth, previous2Month];

  const audits = await db
    .select({
      month: qualityAudits.month,
      channelType: qualityAudits.channelType,
      totalScore: qualityAudits.totalScore,
      status: qualityAudits.status,
    })
    .from(qualityAudits)
    .where(
      and(
        eq(qualityAudits.agentId, agentId),
        eq(qualityAudits.status, "published"),
        inArray(qualityAudits.month, monthTags),
      ),
    );

  return resolveQualitySummary(
    monthTags.map((tag) => ({
      month: tag,
      audits: audits.filter((audit) => audit.month === tag),
    })),
    month,
  );
}
