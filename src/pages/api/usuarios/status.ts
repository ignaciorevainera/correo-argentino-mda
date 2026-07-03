import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { jsonResponse } from "@lib/apiResponse";

const STATUS_PATH = resolve("src/data/last-sync-users-status.json");

export const GET: APIRoute = async () => {
  try {
    const content = await readFile(STATUS_PATH, "utf-8");
    const lastSync = JSON.parse(content);
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
