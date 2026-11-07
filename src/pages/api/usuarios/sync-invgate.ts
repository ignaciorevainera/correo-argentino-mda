import type { APIRoute } from "astro";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { can } from "@lib/roleConfig";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";
import { fullInvgateSync } from "@lib/invgate/userSync";

const STATUS_PATH = resolve("src/data/last-sync-users-status.json");

async function updateSyncStatus(
  status: "success" | "error",
  errorDetail: string | null = null,
): Promise<void> {
  let prevSuccessAt: string | null = null;
  try {
    const raw = await readFile(STATUS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    prevSuccessAt =
      parsed.lastSuccessAt ||
      (parsed.status === "success" ? parsed.lastExecution : null);
  } catch {
    // ignore
  }

  const now = new Date().toISOString();
  const data = {
    lastExecution: now,
    lastSuccessAt: status === "success" ? now : prevSuccessAt,
    status,
    error: errorDetail,
  };
  try {
    await writeFile(STATUS_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[SyncInvGate] Error al guardar estado:", err);
  }
}

export const POST: APIRoute = async ({ locals }) => {
  // Auth: solo admin
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "admin")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  try {
    const result = await fullInvgateSync();

    if (!result.ok) {
      await updateSyncStatus("error", result.error || "Error al sincronizar con InvGate");
      return jsonResponse(
        { error: result.error || "Error al sincronizar con InvGate" },
        500,
      );
    }

    await updateSyncStatus("success");

    return jsonResponse({
      ok: true,
      totalSynced: result.totalSynced,
    });
  } catch (error: any) {
    console.error("[SyncInvGate] Error:", error);
    await updateSyncStatus("error", error?.message || "Error al sincronizar con InvGate");
    return jsonError(
      sanitizeError(error) || "Error al sincronizar con InvGate",
      500,
    );
  }
};
