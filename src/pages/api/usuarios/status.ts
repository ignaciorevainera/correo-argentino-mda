import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { jsonResponse } from "@lib/apiResponse";
import { requireSession } from "@lib/rbac-middleware";

const STATUS_PATH = resolve("src/data/last-sync-users-status.json");

export const GET: APIRoute = async ({ locals }) => {
  const denied = await requireSession(locals);
  if (denied) return denied;
  try {
    const content = await readFile(STATUS_PATH, "utf-8");
    const parsed = JSON.parse(content);
    const isAdmin = locals.user?.role === "admin";
    const lastSync = isAdmin
      ? parsed
      : {
          lastExecution: parsed.lastExecution,
          lastSuccessAt: parsed.lastSuccessAt,
          status: parsed.status,
        };
    return jsonResponse({
      status: "ok",
      serverTime: new Date().toISOString(),
      lastSync,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return jsonResponse({
        status: "ok",
        serverTime: new Date().toISOString(),
        lastSync: null,
      });
    }
    throw error;
  }
};
