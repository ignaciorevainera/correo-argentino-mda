import { db } from "../src/db/index";
import { cubics, agents, cubicAssignments } from "../src/db/schema";
import { cubicMachines } from "../src/lib/cubics";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Iniciando migración de Cubics...");

  for (const cubicData of cubicMachines) {
    console.log(`Procesando Cubic: ${cubicData.name}`);
    const [insertedCubic] = await db
      .insert(cubics)
      .values({
        name: cubicData.name,
        ip: cubicData.ip,
        status: cubicData.status || "offline",
        lastPing: cubicData.lastPing,
      })
      .returning({ id: cubics.id });

    if (!insertedCubic) {
      console.error(`Error al insertar Cubic ${cubicData.name}`);
      continue;
    }

    const cubicId = insertedCubic.id;

    if (cubicData.assignments && Array.isArray(cubicData.assignments)) {
      for (const assignment of cubicData.assignments) {
        const agentData = assignment.agent;
        if (!agentData || !agentData.name) continue;

        let agentId: number;

        const existingAgent = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.name, agentData.name))
          .get();

        if (existingAgent) {
          agentId = existingAgent.id;
          console.log(
            `  -> Agente existente encontrado: ${agentData.name} (ID: ${agentId})`,
          );
        } else {
          const [insertedAgent] = await db
            .insert(agents)
            .values({
              name: agentData.name,
              avatarInitials: agentData.avatarInitials,
            })
            .returning({ id: agents.id });

          agentId = insertedAgent.id;
          console.log(
            `  -> Nuevo agente insertado: ${agentData.name} (ID: ${agentId})`,
          );
        }

        await db.insert(cubicAssignments).values({
          cubicId: cubicId,
          agentId: agentId,
          shift: assignment.shift,
        });
        console.log(`    -> Asignación creada (Turno: ${assignment.shift})`);
      }
    }
  }

  console.log("Migración completada exitosamente.");
}

main().catch((error) => {
  console.error("Error durante la migración:", error);
  process.exit(1);
});
