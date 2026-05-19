import ping from "ping";
import { eq, isNotNull, and, not } from "drizzle-orm";
import { db } from "../src/db/index";
import { cubics } from "../src/db/schema";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSegmentedPingRadar() {
  console.log("[Radar] Servidor de Monitoreo Iniciado.");

  while (true) {
    try {
      console.log(
        "\n[Radar] Consultado Base de Datos SQLite para iniciar nueva ronda...",
      );

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

      while (currentIndex < allMachines.length) {
        const batchSize = isFirstBatch ? 5 : 3;

        const currentBatch = allMachines.slice(
          currentIndex,
          currentIndex + batchSize,
        );

        console.log(
          `[Radar] Procesando lote: Máquinas de la ${currentIndex + 1} a la ${Math.min(currentIndex + batchSize, allMachines.length)} (Total de esta tanda: ${currentBatch.length})`,
        );

        for (const machine of currentBatch) {
          if (!machine.ip) continue;

          try {
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

            await db
              .update(cubics)
              .set({ status: "offline", lastPing: new Date().toISOString() })
              .where(eq(cubics.id, machine.id));
          }
        }

        currentIndex += batchSize;
        isFirstBatch = false;

        if (currentIndex < allMachines.length) {
          console.log(
            "[Radar] Lote finalizado con éxito. Pausando 3 minutos (180s) para no saturar switches...",
          );
          await sleep(180000);
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

      await sleep(30000);
    }
  }
}

runSegmentedPingRadar();
