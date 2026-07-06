import type { APIRoute } from "astro";
import { can } from "@lib/roleConfig";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";
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

  const startTime = Date.now();

  try {
    // Fase 1: resetear todos los empleados a false
    await db.update(employees).set({ invgateExists: false });

    // Fase 2: obtener todos los usuarios de InvGate (API no soporta paginación real)
    const result = await invgateGet<any>("users");

    if (!result.ok) {
      return jsonResponse(
        { error: `Error InvGate: ${result.message}` },
        result.status
      );
    }

    // Soportar array plano o respuesta envuelta en { data: [...] }
    const users: InvgateUser[] = Array.isArray(result.data)
      ? result.data
      : (result.data && Array.isArray(result.data.data) ? result.data.data : []);

    // Filtrar solo usuarios activos (no deshabilitados, no eliminados)
    const activeUsers = users.filter(
      (u) => !u.is_disabled && !u.is_deleted
    );

    // Extraer usernames y marcar en BD por chunks de CHUNK_SIZE
    let totalSynced = 0;
    const chunk: string[] = [];
    for (const user of activeUsers) {
      if (user.username) {
        const localPart = user.username.split('@')[0];
        chunk.push(localPart);
      }
      if (chunk.length >= CHUNK_SIZE) {
        await db
          .update(employees)
          .set({ invgateExists: true })
          .where(inArray(employees.username, chunk));
        totalSynced += chunk.length;
        chunk.length = 0;
      }
    }
    if (chunk.length > 0) {
      await db
        .update(employees)
        .set({ invgateExists: true })
        .where(inArray(employees.username, chunk));
      totalSynced += chunk.length;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[SyncInvGate] Completo: ${totalSynced} usuarios activos en ${elapsed}ms`);

    return jsonResponse({
      ok: true,
      totalSynced,
    });
  } catch (error: any) {
    console.error("[SyncInvGate] Error:", error);
    return jsonError(sanitizeError(error) || "Error al sincronizar con InvGate", 500);
  }
};
