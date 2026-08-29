// src/lib/permissions/cache.ts
import { db } from "../../db";
import {
  mesas,
  routes,
  modules,
  routeAccess,
  moduleAccess,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ModuleFlags, MesaRecord } from "./types";

const CACHE_TTL_MS = 60_000;
const INVALIDATION_FILE = join(
  process.cwd(),
  ".permissions-invalidation-timestamp",
);

let routeSnapshot: Map<string, boolean> | null = null;
let moduleSnapshot: Map<string, ModuleFlags> | null = null;
let moduleByName: Map<string, { id: number; flags: string[] }> | null = null;
let mesasList: MesaRecord[] = [];
let lastLoadedAt = 0;
let loadingPromise: Promise<void> | null = null;

export async function loadPermissionsCache(force = false): Promise<void> {
  if (!force) {
    checkCrossProcessInvalidation();
    if (routeSnapshot && Date.now() - lastLoadedAt < CACHE_TTL_MS) return;
  }
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const [routesRows, modulesRows, routeAccessRows, moduleAccessRows, mesasRows] =
      await Promise.all([
        db.select().from(routes),
        db.select().from(modules),
        db.select().from(routeAccess),
        db.select().from(moduleAccess),
        db.select().from(mesas).where(eq(mesas.active, true)),
      ]);

    const nextRoute = new Map<string, boolean>();
    for (const row of routeAccessRows) {
      nextRoute.set(`${row.routeId}:${row.role}:${row.mesaId}`, row.allowed);
    }

    const nextModule = new Map<string, ModuleFlags>();
    for (const row of moduleAccessRows) {
      nextModule.set(`${row.moduleId}:${row.role}:${row.mesaId}`, {
        canRead: row.canRead,
        canWrite: row.canWrite,
        canViewAll: row.canViewAll,
        canViewComments: row.canViewComments,
        canViewTotals: row.canViewTotals,
      });
    }

    const nextModuleByName = new Map<string, { id: number; flags: string[] }>();
    for (const m of modulesRows) {
      nextModuleByName.set(m.name, { id: m.id, flags: m.flags });
    }

    routeSnapshot = nextRoute;
    moduleSnapshot = nextModule;
    moduleByName = nextModuleByName;
    mesasList = mesasRows;
    lastLoadedAt = Date.now();
  })().finally(() => {
    // Always clear so a rejected load cannot poison the cache for the
    // process lifetime (callers would otherwise keep receiving the same
    // rejected promise and never retry).
    loadingPromise = null;
  });
  return loadingPromise;
}

export async function invalidatePermissionsCache(force = false): Promise<void> {
  routeSnapshot = null;
  moduleSnapshot = null;
  lastLoadedAt = 0;
  try {
    writeFileSync(INVALIDATION_FILE, Date.now().toString());
  } catch {
    // Write failures must not break invalidation; other processes fall back
    // to the CACHE_TTL_MS window.
  }
  if (force) return;
  await loadPermissionsCache(true);
}

// Cross-process invalidation: PM2 runs 3 Astro processes, each with its own
// in-memory cache. On invalidate, the process writes a shared timestamp file;
// other processes detect it via checkCrossProcessInvalidation() on cache
// access and reload. If the file write/read fails, processes fall back to the
// CACHE_TTL_MS (60s) catch-up window.
export function checkCrossProcessInvalidation(): boolean {
  if (!lastLoadedAt) return false;
  try {
    if (!existsSync(INVALIDATION_FILE)) return false;
    const stamp = parseInt(readFileSync(INVALIDATION_FILE, "utf-8"), 10);
    if (!Number.isFinite(stamp) || stamp <= lastLoadedAt) return false;
  } catch {
    return false;
  }
  routeSnapshot = null;
  moduleSnapshot = null;
  lastLoadedAt = 0;
  return true;
}

export function getRouteSnapshot(): ReadonlyMap<string, boolean> {
  if (!routeSnapshot) throw new Error("Permissions cache not loaded");
  // Return a frozen copy so callers cannot mutate the shared snapshot.
  return Object.freeze(new Map(routeSnapshot));
}

export function getModuleSnapshot(): ReadonlyMap<string, ModuleFlags> {
  if (!moduleSnapshot) throw new Error("Permissions cache not loaded");
  return Object.freeze(new Map(moduleSnapshot));
}

export function getModuleByName(): ReadonlyMap<string, { id: number; flags: string[] }> {
  if (!moduleByName) throw new Error("Permissions cache not loaded");
  return Object.freeze(new Map(moduleByName));
}

export function getActiveMesas(): MesaRecord[] {
  return mesasList;
}
