import type { APIRoute } from "astro";
import { requireReadAccess } from "@lib/rbac-middleware";
import { jsonResponse } from "@lib/apiResponse";
import { readPersistedCache } from "@/lib/invgate/cache";
import type { AutoAssignCycleResult } from "@/lib/autogestion/autoAssignRunner";

/**
 * Endpoint de lectura del resultado de la última corrida del ciclo de autoasignación.
 * (Issue #293)
 */
export const GET: APIRoute = async ({ locals }) => {
  const authError = await requireReadAccess(locals, "asignacion_ag");
  if (authError) return authError;

  const lastCycle = readPersistedCache<AutoAssignCycleResult>("autogestion_last_cycle_result");

  return jsonResponse({
    ok: true,
    data: lastCycle ?? null,
  });
};
