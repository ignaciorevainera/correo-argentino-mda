import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "@/db";
import { cubics, users, terminals } from "@/db/schema";
import { sql } from "drizzle-orm";

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
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Para depuración: si se solicita ver los usuarios
  if (url.searchParams.get("debug_users") === "true") {
    if (locals.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const allUsers = await db.select({ id: users.id, username: users.username, role: users.role }).from(users);
      return new Response(JSON.stringify(allUsers), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (dbError: any) {
      return new Response(JSON.stringify({ error: dbError.message }), { status: 500 });
    }
  }

  try {
    // 1. Consultar estado en PM2
    let processes: any[] = [];
    try {
      const { stdout } = await execPromise("pm2 jlist");
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

    // 2. Leer estado del archivo de sincronización
    let lastSyncDetails: any = null;
    try {
      const statusPath = resolve("src/data/last-sync-status.json");
      const content = await readFile(statusPath, "utf-8");
      lastSyncDetails = JSON.parse(content);
    } catch (fileError) {
      // Si el archivo no existe, no hacemos nada (quedará en null)
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

    // 3. Consultar la fecha del último ping registrado en base de datos
    let lastPing: string | null = null;
    try {
      const [pingResult] = await db
        .select({ maxPing: sql<string>`max(${cubics.lastPing})` })
        .from(cubics);
      lastPing = pingResult?.maxPing || null;
    } catch (dbError) {
      console.error("[SyncStatus API] Error al consultar último ping en DB:", dbError);
    }

    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    console.error("[SyncStatus API] Error general:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
