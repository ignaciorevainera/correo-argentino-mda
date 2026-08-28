// src/lib/permissions/resolve.ts
import {
  loadPermissionsCache,
  getRouteSnapshot,
  getModuleSnapshot,
  getModuleByName,
} from "./cache";
import type { ModuleFlags } from "./types";
import {
  routePermissions,
  getModulePermissions as getHardcodedModulePermissions,
  normalizeRole,
  ROLE_HIERARCHY,
  type Role,
} from "../rbac";
import { db } from "../../db";
import { routes } from "../../db/schema";

const ROUTES_TTL_MS = 60_000;

let routesById: Map<number, { path: string; label: string }> | null = null;
let routeIdByPrefix: Array<{ id: number; path: string }> = [];
let routesLastLoadedAt = 0;

// Module-level cache of the routes index so the resolver does not hit the DB
// on every request (it runs through middleware per request). Refreshed only
// when stale (> TTL) or explicitly forced, mirroring cache.ts.
async function loadRoutesIndex(force = false): Promise<void> {
  if (!force && routesById && Date.now() - routesLastLoadedAt < ROUTES_TTL_MS) {
    return;
  }
  const rows = await db.select().from(routes);
  routesById = new Map();
  routeIdByPrefix = [];
  for (const r of rows) {
    routesById.set(r.id, { path: r.path, label: r.label });
    routeIdByPrefix.push({ id: r.id, path: r.path });
  }
  routeIdByPrefix.sort((a, b) => b.path.length - a.path.length);
  routesLastLoadedAt = Date.now();
}

// Force the routes index to reload on the next access. Call this when routes
// are mutated (e.g. alongside invalidatePermissionsCache) so the cached prefix
// map does not serve stale data beyond its TTL.
export function invalidateRoutesIndex(): void {
  routesById = null;
  routeIdByPrefix = [];
  routesLastLoadedAt = 0;
}

function resolveRouteIdByPath(path: string): number | null {
  const lower = path.toLowerCase();
  const match = routeIdByPrefix.find((r) => lower.startsWith(r.path.toLowerCase()));
  return match ? match.id : null;
}

function hardcodedRouteAllowed(path: string, role: string): boolean {
  const normalized = path.toLowerCase();
  const matched = routePermissions
    .filter((r) => normalized.startsWith(r.path.toLowerCase()))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!matched) return true;
  const rank = ROLE_HIERARCHY[normalizeRole(role)] || 0;
  return matched.roles.some((allowedRole) => rank >= ROLE_HIERARCHY[allowedRole]);
}

export async function hasRouteAccess(
  path: string,
  role: string,
  mesaId: number | null,
): Promise<boolean> {
  await loadPermissionsCache();
  await loadRoutesIndex();

  const routeId = resolveRouteIdByPath(path);
  if (routeId == null) return hardcodedRouteAllowed(path, role);

  const snapshot = getRouteSnapshot();
  const mesaSpecificKey = `${routeId}:${role}:${mesaId ?? 0}`;
  if (snapshot.has(mesaSpecificKey)) return snapshot.get(mesaSpecificKey)!;
  if (mesaId != null && snapshot.has(`${routeId}:${role}:0`)) {
    return snapshot.get(`${routeId}:${role}:0`)!;
  }
  return hardcodedRouteAllowed(path, role);
}

// Resolve a module's cached access entry (mesa-specific → global → undefined).
// Returns the cached ModuleFlags if present, else undefined so the caller can
// fall back to the hardcoded default. Resolves moduleId from the in-memory
// cache (no DB hit) — modules are loaded once into cache.ts.
function resolveModuleEntry(
  moduleName: string,
  role: string,
  mesaId: number | null,
): ModuleFlags | undefined {
  const byName = getModuleByName();
  const mod = byName.get(moduleName);
  if (!mod) return undefined;

  const snapshot = getModuleSnapshot();
  const mesaSpecificKey = `${mod.id}:${role}:${mesaId ?? 0}`;
  const specific = snapshot.get(mesaSpecificKey);
  if (specific) return specific;
  if (mesaId != null) {
    const global = snapshot.get(`${mod.id}:${role}:0`);
    if (global) return global;
  }
  return undefined;
}

export async function hasModuleFlag(
  moduleName: string,
  flag: "canRead" | "canWrite" | "canViewAll" | "canViewComments" | "canViewTotals",
  role: string,
  mesaId: number | null,
): Promise<boolean> {
  await loadPermissionsCache();
  const entry = resolveModuleEntry(moduleName, role, mesaId);
  if (entry) return entry[flag];
  return getHardcodedModulePermissions(moduleName, role)[flag];
}

export async function getModulePermissionsFor(
  moduleName: string,
  role: string,
  mesaId: number | null,
): Promise<{
  canRead: boolean;
  canWrite: boolean;
  canViewAll: boolean;
  canViewComments: boolean;
  canViewTotals: boolean;
}> {
  await loadPermissionsCache();
  const entry = resolveModuleEntry(moduleName, role, mesaId);
  if (entry) return entry;
  return getHardcodedModulePermissions(moduleName, role);
}
