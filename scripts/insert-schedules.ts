import { db } from "../src/db/index.js";
import { schedules } from "../src/db/schema.js";

async function main() {
  console.log("Insertando cronograma/schedules...");

  // Ejemplo de datos a insertar
  const data = [
    {
      agentName: "Juan Perez",
      date: new Date().toISOString().split('T')[0], // Fecha de hoy (YYYY-MM-DD)
      status: "Presente",
      comment: "Turno mañana",
      horario: "08:00 - 14:00"
    },
    {
      agentName: "Maria Garcia",
      date: new Date().toISOString().split('T')[0],
      status: "Ausente",
      comment: "Licencia medica",
      horario: "14:00 - 20:00"
    }
  ];

  await db.insert(schedules).values(data);

  console.log("¡Cronograma insertado exitosamente!");
}

main().catch((err) => {
  console.error("Error al insertar los datos:", err);
  process.exit(1);
});
