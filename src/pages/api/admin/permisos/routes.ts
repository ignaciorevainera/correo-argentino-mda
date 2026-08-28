import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "../../../../db";
import { routes, mesas, routeAccess, permissionAuditBatches } from "../../../../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireWriteAccess } from "../../../../lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { invalidatePermissionsCache } from "../../../../lib/permissions/cache";
import { logAdminFromAstro } from "@lib/auditLogger";

const BodySchema = z.object({
  changes: z.array(
    z.object({
      routeId: z.number().int().positive(),
      role: z.enum(["agent", "referent", "team_leader", "supervisor"]),
      mesaId: z.number().int().positive(),
      allowed: z.boolean(),
    }),
  ),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "permisos");
  if (denied) return denied;

  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    return jsonError("Datos inválidos", 400);
  }

  const routeIds = Array.from(new Set(body.changes.map((c) => c.routeId)));
  const mesaIds = Array.from(new Set(body.changes.map((c) => c.mesaId)));
  const [existingRoutes, existingMesas] = await Promise.all([
    db.select({ id: routes.id }).from(routes).where(inArray(routes.id, routeIds)),
    db.select({ id: mesas.id }).from(mesas).where(inArray(mesas.id, mesaIds)),
  ]);
  if (existingRoutes.length !== routeIds.length) return jsonError("Referencia inválida: routeId", 400);
  if (existingMesas.length !== mesaIds.length) return jsonError("Referencia inválida: mesaId", 400);

  let changedCells = 0;
  const summary: any[] = [];

  // better-sqlite3 commits synchronously when the callback returns, so the
  // transaction callback MUST be synchronous (no async/await inside) — otherwise
  // statements run after the commit and lose atomicity. Use .run()/.all() per statement.
  db.transaction((tx) => {
    for (const change of body.changes) {
      const [current] = tx
        .select()
        .from(routeAccess)
        .where(
          and(
            eq(routeAccess.routeId, change.routeId),
            eq(routeAccess.role, change.role),
            eq(routeAccess.mesaId, change.mesaId),
          ),
        )
        .all();

      const before = current ? { allowed: current.allowed } : { allowed: null };
      if (current && current.allowed === change.allowed) continue;

      if (current) {
        tx.update(routeAccess)
          .set({ allowed: change.allowed })
          .where(eq(routeAccess.id, current.id))
          .run();
      } else {
        tx.insert(routeAccess)
          .values({
            routeId: change.routeId,
            role: change.role,
            mesaId: change.mesaId,
            allowed: change.allowed,
          })
          .run();
      }

      summary.push({
        type: "route",
        targetId: change.routeId,
        role: change.role,
        mesaId: change.mesaId,
        before,
        after: { allowed: change.allowed },
      });
      changedCells++;
    }

    if (changedCells > 0) {
      tx.insert(permissionAuditBatches)
        .values({
          adminUsername: locals.user.username,
          editedAt: new Date().toISOString(),
          changedCells,
          summary: JSON.stringify(summary),
        })
        .run();
    }
  });

  await invalidatePermissionsCache();
  await logAdminFromAstro(locals, "permisos.routes.save");

  return jsonResponse({ ok: true, changedCells });
};
