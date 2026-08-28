import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "../../../../db";
import { modules, mesas, moduleAccess, permissionAuditBatches } from "../../../../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireWriteAccess } from "../../../../lib/rbac-middleware";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { invalidatePermissionsCache } from "../../../../lib/permissions/cache";
import { logAdminFromAstro } from "@lib/auditLogger";

const BodySchema = z.object({
  changes: z
    .array(
      z.object({
        moduleId: z.number().int().positive(),
        role: z.enum(["agent", "referent", "team_leader", "supervisor"]),
        mesaId: z.number().int().positive(),
        flags: z.object({
          canRead: z.boolean(),
          canWrite: z.boolean(),
          canViewAll: z.boolean(),
          canViewComments: z.boolean(),
          canViewTotals: z.boolean(),
        }),
      }),
    )
    .max(5000, "Demasiados cambios en una sola operación"),
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

  const moduleIds = Array.from(new Set(body.changes.map((c) => c.moduleId)));
  const mesaIds = Array.from(new Set(body.changes.map((c) => c.mesaId)));
  const [existingModules, existingMesas] = await Promise.all([
    db.select({ id: modules.id }).from(modules).where(inArray(modules.id, moduleIds)),
    db.select({ id: mesas.id }).from(mesas).where(inArray(mesas.id, mesaIds)),
  ]);
  if (existingModules.length !== moduleIds.length) return jsonError("Referencia inválida: moduleId", 400);
  if (existingMesas.length !== mesaIds.length) return jsonError("Referencia inválida: mesaId", 400);

  let changedCells = 0;
  const summary: any[] = [];

  // better-sqlite3 commits synchronously when the callback returns, so the
  // transaction callback MUST be synchronous (no async/await inside) — otherwise
  // statements run after the commit and lose atomicity. Use .run()/.all() per statement.
  try {
    db.transaction((tx) => {
      for (const change of body.changes) {
        const [current] = tx
          .select()
          .from(moduleAccess)
          .where(
            and(
              eq(moduleAccess.moduleId, change.moduleId),
              eq(moduleAccess.role, change.role),
              eq(moduleAccess.mesaId, change.mesaId),
            ),
          )
          .all();

        const before = current
          ? {
              canRead: current.canRead,
              canWrite: current.canWrite,
              canViewAll: current.canViewAll,
              canViewComments: current.canViewComments,
              canViewTotals: current.canViewTotals,
            }
          : { canRead: null, canWrite: null, canViewAll: null, canViewComments: null, canViewTotals: null };

        const f = change.flags;
        if (
          current &&
          current.canRead === f.canRead &&
          current.canWrite === f.canWrite &&
          current.canViewAll === f.canViewAll &&
          current.canViewComments === f.canViewComments &&
          current.canViewTotals === f.canViewTotals
        ) {
          continue;
        }

        if (current) {
          tx.update(moduleAccess)
            .set({
              canRead: f.canRead,
              canWrite: f.canWrite,
              canViewAll: f.canViewAll,
              canViewComments: f.canViewComments,
              canViewTotals: f.canViewTotals,
            })
            .where(eq(moduleAccess.id, current.id))
            .run();
        } else {
          tx.insert(moduleAccess)
            .values({
              moduleId: change.moduleId,
              role: change.role,
              mesaId: change.mesaId,
              canRead: f.canRead,
              canWrite: f.canWrite,
              canViewAll: f.canViewAll,
              canViewComments: f.canViewComments,
              canViewTotals: f.canViewTotals,
            })
            .run();
        }

        summary.push({
          type: "module",
          targetId: change.moduleId,
          role: change.role,
          mesaId: change.mesaId,
          before,
          after: { ...f },
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
  } catch (err) {
    console.error("Error al guardar permisos de módulos:", err);
    return jsonError("Error al guardar. Cambios no aplicados.", 500);
  }

  await invalidatePermissionsCache();
  await logAdminFromAstro(locals, "permisos.modules.save");

  return jsonResponse({ ok: true, changedCells });
};
