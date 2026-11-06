import { canPublishAudit } from "./auditLifecycle.js";

export interface PermissionCheckResult {
  allowed: boolean;
  message?: string;
}

export function validatePublishPermission(role?: string): PermissionCheckResult {
  if (!role || !canPublishAudit(role)) {
    return {
      allowed: false,
      message: "No tiene permisos para publicar auditorías de calidad.",
    };
  }
  return { allowed: true };
}

export function buildPublishAuditPayload(): { status: "published" } {
  return { status: "published" };
}

export interface BatchPublishInput {
  auditIds?: number[];
  agentId?: number;
  month?: string;
}

export type BatchPublishConditions =
  | { valid: true; type: "ids"; auditIds: number[] }
  | { valid: true; type: "agent_month"; agentId: number; month: string }
  | { valid: false; error: string };

export function buildBatchPublishConditions(input: BatchPublishInput): BatchPublishConditions {
  if (Array.isArray(input.auditIds) && input.auditIds.length > 0) {
    const validIds = input.auditIds.filter((id) => typeof id === "number" && !isNaN(id) && id > 0);
    if (validIds.length > 0) {
      return { valid: true, type: "ids", auditIds: validIds };
    }
  }

  if (typeof input.agentId === "number" && input.agentId > 0 && typeof input.month === "string" && input.month.trim().length > 0) {
    return {
      valid: true,
      type: "agent_month",
      agentId: input.agentId,
      month: input.month.trim(),
    };
  }

  return {
    valid: false,
    error: "Debe proporcionar una lista de IDs de auditorías o el par de agente y mes.",
  };
}
