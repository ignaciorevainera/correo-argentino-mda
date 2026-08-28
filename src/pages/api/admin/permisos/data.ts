// src/pages/api/admin/permisos/data.ts
import type { APIRoute } from "astro";
import { db } from "../../../../db";
import { routes, modules, mesas, routeAccess, moduleAccess } from "../../../../db/schema";
import { requireReadAccess } from "../../../../lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  const denied = await requireReadAccess(locals, "permisos");
  if (denied) return denied;

  const [routesRows, modulesRows, mesasRows, routeAccessRows, moduleAccessRows] =
    await Promise.all([
      db.select().from(routes),
      db.select().from(modules),
      db.select().from(mesas),
      db.select().from(routeAccess),
      db.select().from(moduleAccess),
    ]);

  return jsonResponse({
    routes: routesRows.sort((a, b) => a.sortOrder - b.sortOrder),
    modules: modulesRows.sort((a, b) => a.sortOrder - b.sortOrder),
    mesas: mesasRows.sort((a, b) => a.name.localeCompare(b.name)),
    routeAccess: routeAccessRows,
    moduleAccess: moduleAccessRows,
  });
};
