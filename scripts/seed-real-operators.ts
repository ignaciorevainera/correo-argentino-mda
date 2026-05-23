import { db } from "../src/db/index";
import { operators, operatorShifts } from "../src/db/schema";
import operadores from "../src/data/operadores.json";

async function seedRealOperators() {
  console.log("🚀 Iniciando carga de operadores reales...");

  for (const op of operadores) {
    // 1. Insertar el operador base
    await db
      .insert(operators)
      .values({
        id: op.id,
        name: op.name,
        status: "disponible",
        lastAutogestionAssignedAt: Date.now(),
      })
      .onConflictDoNothing();

    // 2. Insertar los turnos (Home y Presencial)
    if (op.shifts) {
      const modalidades = ["home", "presencial"];
      for (const tipo of modalidades) {
        const turno = op.shifts[tipo as keyof typeof op.shifts];
        if (turno) {
          await db
            .insert(operatorShifts)
            .values({
              operatorId: op.id,
              type: tipo,
              shiftStart: turno.start,
              shiftEnd: turno.end,
              breakTime: turno.break,
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  console.log("✅ Carga finalizada con éxito.");
}

seedRealOperators().catch(console.error);
