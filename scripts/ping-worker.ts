import ping from 'ping';
import { eq, isNotNull, and, not } from 'drizzle-orm';
import { db } from '../src/db/index';
import { cubics } from '../src/db/schema';

async function runPingCycle() {
  console.log("[Radar] Iniciando escaneo...");

  try {
    // Consultar todas las máquinas con una IP válida (no nula y no vacía)
    const machines = await db
      .select()
      .from(cubics)
      .where(
        and(
          isNotNull(cubics.ip),
          not(eq(cubics.ip, ''))
        )
      );

    if (machines.length === 0) {
      console.log("[Radar] No se encontraron máquinas con IP válida para escanear.");
      return;
    }

    // Iterar secuencialmente para no saturar la red corporativa
    for (const machine of machines) {
      if (!machine.ip) continue;

      try {
        // Ejecutar ping con timeout de 2 segundos
        const res = await ping.promise.probe(machine.ip, { timeout: 2 });
        const newStatus = res.alive ? 'online' : 'offline';

        // Actualizar el estado y la fecha del último ping en la base de datos
        await db.update(cubics)
          .set({
            status: newStatus,
            lastPing: new Date().toISOString()
          })
          .where(eq(cubics.id, machine.id));

        console.log(`[Radar] Ping a ${machine.ip} (${machine.name}): ${newStatus}`);
      } catch (error) {
        console.error(`[Radar] Error al hacer ping a la máquina ${machine.name} (${machine.ip}):`, error);
        
        // Marcar como offline en caso de error en la librería
        await db.update(cubics)
          .set({
            status: 'offline',
            lastPing: new Date().toISOString()
          })
          .where(eq(cubics.id, machine.id));
      }
    }
  } catch (error) {
    console.error("[Radar] Error crítico durante el ciclo de escaneo:", error);
  } finally {
    console.log("[Radar] Escaneo finalizado.");
  }
}

// Invocación inmediata
runPingCycle();

// Programar para que se ejecute cada 5 minutos (300000 ms)
setInterval(runPingCycle, 600000);
