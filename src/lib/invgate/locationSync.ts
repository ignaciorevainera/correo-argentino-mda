import { db } from "../../db/index";
import { employees, offices } from "../../db/schema";
import { invgateGet } from "../invgateClient";
import { sql } from "drizzle-orm";
import { parseInvgateLocationName } from "./locationMatcher";

export async function syncInvgateLocations(): Promise<void> {
  console.log("[SyncInvGate] Iniciando sincronización de ubicaciones...");

  // 1. Limpieza previa: setear sucursal a NULL para todos los empleados
  console.log("[SyncInvGate] Limpiando sucursales previas...");
  await db.update(employees).set({ sucursal: null });

  // 2. Cargar todas las oficinas (NIS y Nombre)
  console.log("[SyncInvGate] Cargando diccionario de oficinas...");
  const allOfficesRows = await db.select({ code: offices.code, name: offices.name }).from(offices);
  const officesSet = new Set(allOfficesRows.map((o) => o.code));

  // 3. Obtener locations de InvGate
  const locationsResult = await invgateGet<any[]>("locations");
  if (!locationsResult.ok || !("data" in locationsResult)) {
    const errorMsg = "message" in locationsResult ? (locationsResult as any).message : "Sin datos";
    console.warn("[SyncInvGate] Error al obtener ubicaciones de InvGate:", errorMsg);
    return;
  }

  const locations = Array.isArray(locationsResult.data) 
    ? locationsResult.data 
    : (locationsResult.data as any).data;

  if (!Array.isArray(locations)) {
    console.warn("[SyncInvGate] El formato de locations de InvGate no es un array.");
    return;
  }

  const populated = locations.filter((l: any) => l.total > 0);
  console.log(`[SyncInvGate] Se encontraron ${populated.length} ubicaciones con usuarios.`);

  // 4. Procesar en paralelo en chunks de a 20
  let locationsProcessed = 0;
  let totalUsersUpdated = 0;

  for (let i = 0; i < populated.length; i += 20) {
    const chunk = populated.slice(i, i + 20);
    await Promise.all(
      chunk.map(async (loc: any) => {
        const locUsersResult = await invgateGet<any[]>(`locations.users?id=${loc.id}`);
        if (!locUsersResult.ok || !Array.isArray(locUsersResult.data)) {
          return;
        }
        
        const locUsers = locUsersResult.data;
        if (locUsers.length === 0) return;

        // Extraer NIS
        const parsed = parseInvgateLocationName(loc.name);
        let sucursalToSave = loc.name; // fallback crudo
        if (parsed.nis && officesSet.has(parsed.nis)) {
          sucursalToSave = parsed.nis; // usar NIS normalizado
        }

        // Actualizar empleados
        for (const user of locUsers) {
          if (user.username) {
            const baseUsername = user.username.split("@")[0];
            try {
              const res = await db
                .update(employees)
                .set({ sucursal: sucursalToSave })
                .where(sql`lower(${employees.username}) = lower(${baseUsername})`);
              
              if (res.changes > 0) {
                totalUsersUpdated += res.changes;
              }
            } catch (e) {
              // ignorar si falla
            }
          }
        }
      })
    );

    locationsProcessed += chunk.length;
    console.log(`[SyncInvGate] Procesadas ${locationsProcessed} / ${populated.length} ubicaciones...`);
  }

  console.log(`[SyncInvGate] Sincronización de ubicaciones finalizada. Empleados actualizados: ${totalUsersUpdated}`);
}
