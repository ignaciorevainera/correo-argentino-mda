// src/lib/permissions/resolve.ts
import {
  loadPermissionsCache,
  getRouteSnapshot,
  getModuleSnapshot,
} from "./cache";
import {
  routePermissions,
  getModulePermissions as getHardcodedModulePermissions,
  normalizeRole,
  ROLE_HIERARCHY,
  type Role,
} from "../rbac";
import { db } from "../../db";
import { routes, modules } from "../../db/schema";
import { eq } from "drizzle-orm";

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
  const mesaKey = `${routeId}:${role}:${mesaId ?? 0}`;
  if (snapshot.has(mesaKey)) return snapshot.get(mesaKey)!;
  return hardcodedRouteAllowed(path, role);
}

export async function hasModuleFlag(
  moduleName: string,
  flag: "canRead" | "canWrite" | "canViewAll" | "canViewComments" | "canViewTotals",
  role: string,
  mesaId: number | null,
): Promise<boolean> {
  await loadPermissionsCache();
  const [mod] = await db.select().from(modules).where(eq(modules.name, moduleName));
  if (!mod) return getHardcodedModulePermissions(moduleName, role)[flag];

  const snapshot = getModuleSnapshot();
  const key = `${mod.id}:${role}:${mesaId ?? 0}`;
  if (snapshot.has(key)) return snapshot.get(key)![flag];
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
  const [mod] = await db.select().from(modules).where(eq(modules.name, moduleName));
  if (!mod) return getHardcodedModulePermissions(moduleName, role);

  const snapshot = getModuleSnapshot();
  const key = `${mod.id}:${role}:${mesaId ?? 0}`;
  if (snapshot.has(key)) return snapshot.get(key)!;
  return getHardcodedModulePermissions(moduleName, role);
}
