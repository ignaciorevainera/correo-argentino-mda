import type { APIRoute } from "astro";
import { can } from "@lib/roleConfig";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { inArray } from "drizzle-orm";
import type { InvgateUser } from "@/types/invgate";

const CHUNK_SIZE = 500;

export const POST: APIRoute = async ({ locals }) => {
  // Auth: solo admin
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "admin")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  try {
    // Fase 1: resetear todos los empleados a false
    await db.update(employees).set({ invgateExists: false });

    // Fase 2: paginar sobre todos los usuarios activos de InvGate
    let page = 1;
    let totalSynced = 0;
    const pageSize = 500;

    while (true) {
      const result = await invgateGet<any>(
        `users?page=${page}&page_size=${pageSize}`
      );

      if (!result.ok) {
        return jsonResponse(
          { error: `Error InvGate (página ${page}): ${result.message}` },
          result.status
        );
      }

      // Soportar array plano o respuesta envuelta en { data: [...] }
      const users: InvgateUser[] = Array.isArray(result.data)
        ? result.data
        : (result.data && Array.isArray(result.data.data) ? result.data.data : []);

      if (users.length === 0) break;

      // Filtrar solo usuarios activos (no deshabilitados, no eliminados)
      const activeUsers = users.filter(
        (u) => !u.is_disabled && !u.is_deleted
      );

      // Extraer usernames y marcar en BD por chunks
      const chunk: string[] = [];
      for (const user of activeUsers) {
        if (user.username) {
          const localPart = user.username.split('@')[0];
          chunk.push(localPart);
        }
        // Cuando el chunk llega a CHUNK_SIZE, ejecutar update
        if (chunk.length >= CHUNK_SIZE) {
          await db
            .update(employees)
            .set({ invgateExists: true })
            .where(inArray(employees.username, chunk));
          totalSynced += chunk.length;
          chunk.length = 0;
        }
      }
      // Chunk residual
      if (chunk.length > 0) {
        await db
          .update(employees)
          .set({ invgateExists: true })
          .where(inArray(employees.username, chunk));
        totalSynced += chunk.length;
      }

      // Verificar si hay más páginas
      // Si la cantidad de registros devueltos es menor que pageSize, es la última
      if (users.length < pageSize) break;
      page++;
    }

    return jsonResponse({
      ok: true,
      totalSynced,
      pagesProcessed: page,
    });
  } catch (error: any) {
    console.error("[SyncInvGate] Error:", error);
    return jsonError(error.message || "Error al sincronizar con InvGate", 500);
  }
};
