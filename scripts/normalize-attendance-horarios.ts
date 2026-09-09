import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbPath = fileURLToPath(new URL("../database/mda.db", import.meta.url));
if (!existsSync(dbPath)) {
  console.error(`No se encontró la base de datos: ${dbPath}`);
  process.exit(1);
}

const sqlite = new Database(dbPath);
console.log(`Conectado a: ${dbPath}`);
console.log("Iniciando normalización inteligente de horario_estipulado con herencia de cronograma...");

const agents = sqlite.prepare("SELECT * FROM agents").all() as any[];
const agentsById = new Map(agents.map((a) => [a.id, a]));

const daysMap = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

// Busca registros que no tengan horario cargado, o figuren como Franco o default
const attRows = sqlite
  .prepare(
    `SELECT id, agent_id, date, horario_estipulado 
     FROM operator_attendance 
     WHERE horario_estipulado IS NULL 
        OR trim(horario_estipulado) = '' 
        OR trim(horario_estipulado) = 'Franco' 
        OR trim(horario_estipulado) = '--:--'`,
  )
  .all() as any[];

console.log(`Registros de operator_attendance a evaluar: ${attRows.length}`);

let updatedSchedules = 0;
let confirmedFrancos = 0;

const updateStmt = sqlite.prepare("UPDATE operator_attendance SET horario_estipulado = ? WHERE id = ?");

const updateTx = sqlite.transaction(() => {
  for (const row of attRows) {
    const agent = agentsById.get(row.agent_id);
    if (!agent) continue;

    let targetHorario = "";

    // 1. Prioridad: Buscar turno en la tabla de cronograma (schedules)
    const sched = sqlite
      .prepare("SELECT status, horario FROM schedules WHERE agent_name = ? AND date = ?")
      .get(agent.name, row.date) as any;

    if (sched) {
      if (sched.horario && sched.horario.trim() !== "" && sched.horario !== "Franco" && sched.horario !== "-") {
        targetHorario = sched.horario.trim();
      } else if (sched.status === "Franco") {
        targetHorario = "--:--";
      }
    }

    // 2. Fallback: Esquema semanal y horario por defecto del operador
    if (!targetHorario) {
      try {
        const [y, m, d] = row.date.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayName = daysMap[dateObj.getDay()];

        const weekly = agent.esquema_semanal ? JSON.parse(agent.esquema_semanal) : {};
        const hourly = agent.esquema_horario ? JSON.parse(agent.esquema_horario) : {};

        const status = weekly[dayName];
        const h = hourly[dayName];

        if (status === "Franco") {
          targetHorario = "--:--";
        } else if (h && h.trim() !== "" && h !== "-") {
          targetHorario = h.trim();
        } else if (agent.horario_default && agent.horario_default.trim() !== "" && agent.horario_default !== "-") {
          targetHorario = agent.horario_default.trim();
        } else {
          targetHorario = "--:--";
        }
      } catch (e) {
        targetHorario = "--:--";
      }
    }

    if (!targetHorario) targetHorario = "--:--";

    if (targetHorario === "--:--") {
      confirmedFrancos++;
    } else {
      updatedSchedules++;
    }

    if (row.horario_estipulado !== targetHorario) {
      updateStmt.run(targetHorario, row.id);
    }
  }
});

updateTx();

console.log(`Registros que heredaron su turno del cronograma: ${updatedSchedules}`);
console.log(`Registros confirmados como Franco / sin turno (--:--): ${confirmedFrancos}`);

sqlite.close();
console.log("Normalización finalizada con éxito.");
