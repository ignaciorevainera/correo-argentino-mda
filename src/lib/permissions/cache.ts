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
import type { ModuleFlags, MesaRecord } from "./types";

const CACHE_TTL_MS = 60_000;

let routeSnapshot: Map<string, boolean> | null = null;
let moduleSnapshot: Map<string, ModuleFlags> | null = null;
let mesasList: MesaRecord[] = [];
let lastLoadedAt = 0;
let loadingPromise: Promise<void> | null = null;

export async function loadPermissionsCache(force = false): Promise<void> {
  if (!force && routeSnapshot && Date.now() - lastLoadedAt < CACHE_TTL_MS) return;
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

    routeSnapshot = new Map();
    for (const row of routeAccessRows) {
      routeSnapshot.set(`${row.routeId}:${row.role}:${row.mesaId}`, row.allowed);
    }

    moduleSnapshot = new Map();
    for (const row of moduleAccessRows) {
      moduleSnapshot.set(`${row.moduleId}:${row.role}:${row.mesaId}`, {
        canRead: row.canRead,
        canWrite: row.canWrite,
        canViewAll: row.canViewAll,
        canViewComments: row.canViewComments,
        canViewTotals: row.canViewTotals,
      });
    }

    mesasList = mesasRows;
    lastLoadedAt = Date.now();
    loadingPromise = null;
  })();
  return loadingPromise;
}

export async function invalidatePermissionsCache(force = false): Promise<void> {
  routeSnapshot = null;
  moduleSnapshot = null;
  lastLoadedAt = 0;
  if (force) return;
  await loadPermissionsCache(true);
}

export function getRouteSnapshot(): Map<string, boolean> {
  if (!routeSnapshot) throw new Error("Permissions cache not loaded");
  return routeSnapshot;
}

export function getModuleSnapshot(): Map<string, ModuleFlags> {
  if (!moduleSnapshot) throw new Error("Permissions cache not loaded");
  return moduleSnapshot;
}

export function getActiveMesas(): MesaRecord[] {
  return mesasList;
}
