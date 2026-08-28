// src/lib/permissions/types.ts
import type { Role } from "../rbac";

/*
 * CLARIFICATION — mesaId global cache-key convention
 *
 * The cache key uses `mesaId ?? 0` (resolve.ts) to represent a "global"
 * override slot in the in-memory cache. Global rows are NEVER written to the
 * DB — the UI only edits mesaId-specific cells. Therefore the
 * `routeAccess.mesaId` / `moduleAccess.mesaId` columns stay NOT NULL; the
 * `:0` slot is purely a cache-key fallback that resolves to the hardcoded
 * default. Do NOT treat a null/0 mesaId as a valid DB row. Client change DTOs
 * (RouteChange / ModuleChange) always carry a concrete positive mesaId.
 */

export type ModuleFlag =
  | "canRead"
  | "canWrite"
  | "canViewAll"
  | "canViewComments"
  | "canViewTotals";

export const ALL_MODULE_FLAGS: ModuleFlag[] = [
  "canRead",
  "canWrite",
  "canViewAll",
  "canViewComments",
  "canViewTotals",
];

export const EDITABLE_ROLES: Exclude<Role, "admin">[] = [
  "agent",
  "referent",
  "team_leader",
  "supervisor",
];

export type ModuleFlags = {
  canRead: boolean;
  canWrite: boolean;
  canViewAll: boolean;
  canViewComments: boolean;
  canViewTotals: boolean;
};

// Cache snapshots are stored as Maps in cache.ts, not these Record aliases.
// Kept explicit to avoid drift: key format is "routeId:role:mesaId??0".
export type RouteAccessSnapshot = Map<string, boolean>;
export type ModuleAccessSnapshot = Map<string, ModuleFlags>;

// Change DTOs mirror the API body (Tasks 9/10). `role` is narrowed to
// EDITABLE_ROLES because admin is intentionally non-editable (zod rejects it).
// `mesaId` is a concrete positive integer — the global/null slot is a cache-key
// fallback only and is never accepted from the client (rejected by zod).
export type RouteChange = {
  routeId: number;
  role: Exclude<Role, "admin">;
  mesaId: number;
  allowed: boolean;
};

export type ModuleChange = {
  moduleId: number;
  role: Exclude<Role, "admin">;
  mesaId: number;
  flags: ModuleFlags;
};

export type MesaRecord = {
  id: number;
  invgateId: number;
  name: string;
  displayName: string | null;
  active: boolean;
  lastSyncedAt: string;
};
