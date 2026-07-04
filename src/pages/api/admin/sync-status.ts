import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "@db/index";
import { cubics, users, terminals } from "@db/schema";
import { sql } from "drizzle-orm";
import { jsonResponse } from "@lib/apiResponse";

const execPromise = promisify(exec);

function getNextSyncDate(): string {
  const now = new Date();
  const next = new Date(now);
  if (now.getHours() < 5) {
    next.setHours(5, 0, 0, 0);
  } else if (now.getHours() < 17) {
    next.setHours(17, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(5, 0, 0, 0);
  }
  return next.toISOString();
}

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  if (url.searchParams.get("debug_users") === "true") {
    if (locals.user.role !== "admin") {
      return jsonResponse({ error: "No autorizado" }, 403);
    }
    try {
      const allUsers = await db.select({ id: users.id, username: users.username, role: users.role }).from(users);
      return jsonResponse(allUsers);
    } catch (dbError: any) {
      return jsonResponse({ error: dbError.message }, 500);
    }
  }

  try {
    let processes: any[] = [];
    try {
      const { stdout } = await execPromise("pm2 jlist", { windowsHide: true, timeout: 5000 });
      processes = JSON.parse(stdout);
    } catch (pm2Error) {
      console.warn("[SyncStatus API] PM2 no disponible o falló:", pm2Error);
    }

    const syncProcess = processes.find(
      (p: any) => p.name === "sync-legacy-inventory"
    );
    const pingProcess = processes.find(
      (p: any) => p.name === "mda-ping-cubics"
    );

    let lastSyncDetails: any = null;
    try {
      const statusPath = resolve("src/data/last-sync-status.json");
      const content = await readFile(statusPath, "utf-8");
      lastSyncDetails = JSON.parse(content);
    } catch (fileError) {
    }

    let lastSyncDB: string | null = null;
    try {
      const [syncResult] = await db
        .select({ maxSync: sql<string>`max(${terminals.syncedAt})` })
        .from(terminals);
      lastSyncDB = syncResult?.maxSync || null;
    } catch (dbError) {
      console.error("[SyncStatus API] Error al consultar última sincronización en DB:", dbError);
    }

    let lastPing: string | null = null;
    try {
      const [pingResult] = await db
        .select({ maxPing: sql<string>`max(${cubics.lastPing})` })
        .from(cubics);
      lastPing = pingResult?.maxPing || null;
    } catch (dbError) {
      console.error("[SyncStatus API] Error al consultar último ping en DB:", dbError);
    }

    return jsonResponse({
      sync: {
        status: syncProcess?.pm2_env?.status || "stopped",
        lastExecution: lastSyncDB || lastSyncDetails?.lastExecution || null,
        lastStatus: lastSyncDetails?.status || null,
        error: lastSyncDetails?.error || null,
        nextExecution: getNextSyncDate(),
      },
      ping: {
        status: pingProcess?.pm2_env?.status || "stopped",
        lastPing,
      },
    });
  } catch (e: any) {
    console.error("[SyncStatus API] Error general:", e);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  }
};
