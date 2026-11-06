export type QualityAuditStatus = "draft" | "published";

export const QUALITY_AUDIT_STATUSES: QualityAuditStatus[] = ["draft", "published"];

export function isValidAuditStatus(status: unknown): status is QualityAuditStatus {
  return typeof status === "string" && (status === "draft" || status === "published");
}

export function filterAuditsForOperator<T extends { status?: string | null }>(audits: T[]): T[] {
  return audits.filter((audit) => audit.status === "published");
}

export function filterAuditsForSupervisor<T extends { status?: string | null }>(
  audits: T[],
  filter?: "all" | "draft" | "published",
): T[] {
  if (!filter || filter === "all") return audits;
  return audits.filter((audit) => audit.status === filter);
}

export function countPendingDrafts<T extends { status?: string | null }>(audits: T[]): number {
  return audits.filter((audit) => audit.status === "draft").length;
}

export function canPublishAudit(role: string): boolean {
  return role === "supervisor" || role === "admin";
}
