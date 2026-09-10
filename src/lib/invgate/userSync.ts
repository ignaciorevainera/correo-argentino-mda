import { db } from "@db/index";
import { employees } from "@db/schema";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateUser } from "@/types/invgate";
import { syncInvgateLocations } from "./locationSync";
import { inArray, sql } from "drizzle-orm";

const CHUNK_SIZE = 500;

async function flushUserData(
  usernames: string[],
  userDataMap: Map<string, { position: string | null; invgateId: number }>,
) {
  for (const username of usernames) {
    const data = userDataMap.get(username);
    if (data) {
      await db
        .update(employees)
        .set({ position: data.position, invgateId: data.invgateId })
        .where(sql`lower(${employees.username}) = ${username}`);
    }
  }
}

export interface SyncResult {
  ok: boolean;
  totalSynced: number;
  error?: string;
}

export async function fullInvgateSync(): Promise<SyncResult> {
  console.log("[SyncInvGate] Iniciando sincronización completa de InvGate...");

  // Fase 1: resetear todos los empleados a false
  await db.update(employees).set({ invgateExists: false });

  // Fase 2: obtener todos los usuarios de InvGate (timeout 120s por la cantidad de datos)
  const result = await invgateGet<any>("users", 120000);

  if (!result.ok) {
    console.error(
      `[SyncInvGate] Error al obtener usuarios de InvGate: ${result.message}`,
    );
    return {
      ok: false,
      totalSynced: 0,
      error: `Error InvGate: ${result.message}`,
    };
  }

  // Soportar array plano o respuesta envuelta en { data: [...] }
  const users: InvgateUser[] = Array.isArray(result.data)
    ? result.data
    : result.data && Array.isArray(result.data.data)
      ? result.data.data
      : [];

  // Filtrar solo usuarios activos
  const activeUsers = users.filter((u) => !u.is_disabled && !u.is_deleted);

  // Extraer usernames y marcar en BD por chunks de CHUNK_SIZE
  let totalSynced = 0;
  const chunk: string[] = [];
  const userDataMap = new Map<
    string,
    { position: string | null; invgateId: number }
  >();

  for (const user of activeUsers) {
    if (user.username) {
      const localPart = user.username.split("@")[0].toLowerCase();
      chunk.push(localPart);
      userDataMap.set(localPart, {
        position: user.position || null,
        invgateId: user.id,
      });
    }

    if (chunk.length >= CHUNK_SIZE) {
      await db
        .update(employees)
        .set({ invgateExists: true })
        .where(inArray(sql`lower(${employees.username})`, chunk));
      await flushUserData(chunk, userDataMap);
      totalSynced += chunk.length;
      chunk.length = 0;
      userDataMap.clear();
    }
  }

  if (chunk.length > 0) {
    await db
      .update(employees)
      .set({ invgateExists: true })
      .where(inArray(sql`lower(${employees.username})`, chunk));
    await flushUserData(chunk, userDataMap);
    totalSynced += chunk.length;
  }

  // Fase 3: Sincronizar ubicaciones (sucursales)
  await syncInvgateLocations();

  console.log(
    `[SyncInvGate] Sincronización completa finalizada. ${totalSynced} usuarios marcados.`,
  );
  return {
    ok: true,
    totalSynced,
  };
}
