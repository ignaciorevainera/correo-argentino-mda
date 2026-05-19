import ping from "ping";
import { eq, isNotNull, and, not } from "drizzle-orm";
import { db } from "../src/db/index";
import { cubics } from "../src/db/schema";

// Función auxiliar para pausar el hilo de ejecución de manera nativa
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSegmentedPingRadar() {
  console.log("[Radar] Servidor de Monitoreo Iniciado.");

  // Bucle infinito inteligente que mantendrá el proceso de PM2 vivo e indetectable
  while (true) {
    try {
      console.log(
        "\n[Radar] Consultado Base de Datos SQLite para iniciar nueva ronda...",
      );

      // Traemos todas las terminales configuradas con IPs válidas
      const allMachines = await db
        .select()
        .from(cubics)
        .where(and(isNotNull(cubics.ip), not(eq(cubics.ip, ""))));

      if (allMachines.length === 0) {
        console.log(
          "[Radar] Sin terminales para escanear. Durmiendo 5 minutos antes de reintentar...",
        );
        await sleep(300000);
        continue;
      }

      let currentIndex = 0;
      let isFirstBatch = true;

      // Consumimos el lote total de máquinas de forma dinámica segmentándolo según tu regla
      while (currentIndex < allMachines.length) {
        // Regla de segmentación: 5 en el primer lote, de a 3 elementos en los lotes subsiguientes
        const batchSize = isFirstBatch ? 5 : 3;

        // Extraemos la porción (slice) correspondiente
        const currentBatch = allMachines.slice(
          currentIndex,
          currentIndex + batchSize,
        );

        console.log(
          `[Radar] Procesando lote: Máquinas de la ${currentIndex + 1} a la ${Math.min(currentIndex + batchSize, allMachines.length)} (Total de esta tanda: ${currentBatch.length})`,
        );

        // Procesamos secuencialmente las máquinas de este lote específico
        for (const machine of currentBatch) {
          if (!machine.ip) continue;

          try {
            // Probe con timeout de 2 segundos estricto para no retrasar el lote
            const res = await ping.promise.probe(machine.ip, { timeout: 2 });
            const newStatus = res.alive ? "online" : "offline";

            await db
              .update(cubics)
              .set({
                status: newStatus,
                lastPing: new Date().toISOString(),
              })
              .where(eq(cubics.id, machine.id));

            console.log(
              `  -> Ping a ${machine.ip} (${machine.name}): ${newStatus}`,
            );
          } catch (pingError) {
            console.error(
              `  -> [Error] Falló enlace físico con ${machine.name} (${machine.ip}):`,
              pingError,
            );

            // Failover por excepción: marcamos offline por seguridad
            await db
              .update(cubics)
              .set({ status: "offline", lastPing: new Date().toISOString() })
              .where(eq(cubics.id, machine.id));
          }
        }

        // Desplazamos el puntero del lote
        currentIndex += batchSize;
        isFirstBatch = false;

        // Si todavía quedan más máquinas en la lista por procesar, pausamos 3 minutos
        if (currentIndex < allMachines.length) {
          console.log(
            "[Radar] Lote finalizado con éxito. Pausando 3 minutos (180s) para no saturar switches...",
          );
          await sleep(180000); // 3 minutos en milisegundos
        }
      }

      console.log(
        "[Radar] Ronda completa finalizada. Volviendo al inicio del mapa de red.",
      );
    } catch (criticalError) {
      console.error(
        "[Radar] Error crítico en el bucle principal:",
        criticalError,
      );
      // Evita colapsar la CPU si la base de datos se desconecta temporalmente
      await sleep(30000);
    }
  }
}

// Ejecución inmediata al arrancar el proceso de PM2
runSegmentedPingRadar();
