import { db } from "./index";
import { cubics, agents, cubicAssignments } from "./schema";

async function seedSchedule() {
  console.log("Iniciando inserción de cronograma/schedule...");

  try {
    // 1. Insertar PCs (Host PCs)
    const insertedCubics = await db.insert(cubics).values([
      { name: "PC-HOST-01", ip: "192.168.1.101", status: "online" },
      { name: "PC-HOST-02", ip: "192.168.1.102", status: "online" },
      { name: "PC-HOST-03", ip: "192.168.1.103", status: "offline" },
    ]).returning();

    console.log(`✅ PCs insertadas: ${insertedCubics.length}`);

    // 2. Insertar Agentes
    const insertedAgents = await db.insert(agents).values([
      { name: "Juan Pérez", avatarInitials: "JP" },
      { name: "María Gómez", avatarInitials: "MG" },
      { name: "Carlos López", avatarInitials: "CL" },
    ]).returning();

    console.log(`✅ Agentes insertados: ${insertedAgents.length}`);

    // 3. Crear cronograma/schedule (Asignar agentes a PCs en distintos turnos)
    if (insertedCubics.length >= 2 && insertedAgents.length >= 3) {
      await db.insert(cubicAssignments).values([
        // PC-HOST-01: Juan a la mañana, María a la tarde
        { cubicId: insertedCubics[0].id, agentId: insertedAgents[0].id, shift: "Mañana (08:00 - 14:00)" },
        { cubicId: insertedCubics[0].id, agentId: insertedAgents[1].id, shift: "Tarde (14:00 - 20:00)" },
        
        // PC-HOST-02: Carlos a la mañana
        { cubicId: insertedCubics[1].id, agentId: insertedAgents[2].id, shift: "Mañana (08:00 - 14:00)" },
      ]);
      console.log("✅ Cronograma (cubic_assignments) insertado con éxito.");
    }
  } catch (error) {
    console.error("❌ Error al insertar cronograma:", error);
  } finally {
    console.log("🏁 Proceso finalizado.");
  }
}

seedSchedule();
