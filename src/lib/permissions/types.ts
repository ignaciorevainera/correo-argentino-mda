// src/lib/permissions/types.ts
import type { Role } from "../rbac";

/*
 * CLARIFICATION — mesaId: number | null cache-key convention
 *
 * The `mesaId: number | null` fields on RouteChange / ModuleChange / the
 * snapshot key conventions represent a "global" override slot in the
 * in-memory cache key convention. resolve.ts uses `mesaId ?? 0` as the cache
 * key when mesaId is null. Global rows are NEVER written to the DB — the UI
 * only edits mesaId-specific cells. Therefore the `routeAccess.mesaId` /
 * `moduleAccess.mesaId` columns stay NOT NULL; the `null` / `:0` slot is
 * purely a cache-key fallback that resolves to the hardcoded default. Do NOT
 * treat a null mesaId as a valid DB row.
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

export type RouteAccessSnapshot = Record<string, boolean>; // key: "routeId:role:mesaId|null"
export type ModuleAccessSnapshot = Record<string, ModuleFlags>;

export type RouteChange = {
  routeId: number;
  role: Role;
  mesaId: number | null;
  allowed: boolean;
};

export type ModuleChange = {
  moduleId: number;
  role: Role;
  mesaId: number | null;
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
