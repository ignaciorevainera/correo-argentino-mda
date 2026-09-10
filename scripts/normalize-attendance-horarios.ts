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
console.log("Iniciando normalización inteligente y completa de horario_estipulado...");

// 1. Cargar datos maestros
const agents = sqlite.prepare("SELECT * FROM agents").all() as any[];
const agentsById = new Map(agents.map((a) => [a.id, a]));

const overtimeShifts = sqlite.prepare("SELECT * FROM weekend_overtime_shifts").all() as any[];
const overtimeMap = new Map<string, string>();
for (const ot of overtimeShifts) {
  overtimeMap.set(`${ot.agent_id}_${ot.date}`, `${ot.start_time} - ${ot.end_time}`);
}

const rotationConfigs = sqlite.prepare("SELECT * FROM saturday_rotation_config").all() as any[];
const satGroupOverrides = sqlite.prepare("SELECT * FROM agent_saturday_groups").all() as any[];

const daysMap = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

function getAgentSaturdayConfig(agentId: number, monthStr: string): { group: string | null; horario: string | null } {
  const agent = agentsById.get(agentId);
  if (!agent) return { group: null, horario: null };

  const overrides = satGroupOverrides
    .filter((g) => g.agent_id === agentId)
    .sort((a, b) => a.month.localeCompare(b.month));

  let currentGroup = agent.saturday_group || null;
  let currentHorario = agent.saturday_horario || null;

  const configForMonth = overrides.find((o) => o.month === monthStr);
  if (configForMonth) {
    currentGroup = configForMonth.saturday_group || null;
    currentHorario = configForMonth.saturday_horario || null;
  } else {
    const prevConfigs = overrides.filter((o) => o.month < monthStr);
    if (prevConfigs.length > 0) {
      const closest = prevConfigs[prevConfigs.length - 1];
      currentGroup = closest.saturday_group || null;
      currentHorario = closest.saturday_horario || null;
    }
  }

  return { group: currentGroup, horario: currentHorario };
}

function resolveSaturdayRotation(agentId: number, dateStr: string): string | null {
  const agent = agentsById.get(agentId);
  if (!agent) return null;
  const monthStr = dateStr.substring(0, 7);

  const { group: currentGroup, horario: currentHorario } = getAgentSaturdayConfig(agentId, monthStr);
  if (!currentGroup) return null;

  let rotConfig = rotationConfigs.find((c) => c.month === monthStr);
  if (!rotConfig) {
    const sorted = rotationConfigs
      .filter((c) => c.month < monthStr)
      .sort((a, b) => b.month.localeCompare(a.month));
    rotConfig = sorted[0];
  }
  if (!rotConfig) return null;

  const dateObj = new Date(dateStr + "T12:00:00");
  const start = new Date(rotConfig.start_date + "T12:00:00");
  const diffDays = Math.round((dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const weeksDiff = Math.floor(diffDays / 7);
  const groups = rotConfig.rotation_order.split(",").map((g: string) => g.trim());
  const N = groups.length;
  const startIndex = groups.indexOf(rotConfig.start_group);
  const idx = startIndex >= 0 ? startIndex : 0;
  const activeIndex = (((idx + weeksDiff) % N) + N) % N;
  const activeGroup = groups[activeIndex];

  const disabledGroups = (rotConfig.disabled_groups || "")
    .split(",")
    .map((g: string) => g.trim())
    .filter(Boolean);
  if (disabledGroups.includes(currentGroup)) return null;

  if (currentGroup === activeGroup) {
    return currentHorario || "07:00 - 13:00";
  }
  return null;
}

// 2. Obtener registros de asistencia a evaluar
// Evaluamos todos los que están vacíos, son Franco, son '--:--', o tienen shift_type = 'overtime'
const attRows = sqlite
  .prepare(
    `SELECT id, agent_id, date, shift_type, horario_estipulado, entrada_real, cumplimiento, asistencia 
     FROM operator_attendance 
     WHERE horario_estipulado IS NULL 
        OR trim(horario_estipulado) = '' 
        OR trim(horario_estipulado) = 'Franco' 
        OR trim(horario_estipulado) = '--:--'
        OR shift_type = 'overtime'`,
  )
  .all() as any[];

console.log(`Registros de operator_attendance a evaluar: ${attRows.length}`);

let restoredOvertime = 0;
let restoredSaturday = 0;
let inheritedCronograma = 0;
let confirmedFrancos = 0;
let restoredAttendedFallbacks = 0;

const updateStmt = sqlite.prepare("UPDATE operator_attendance SET horario_estipulado = ? WHERE id = ?");

const updateTx = sqlite.transaction(() => {
  for (const row of attRows) {
    const agent = agentsById.get(row.agent_id);
    if (!agent) continue;

    let targetHorario = "";

    // A. Prioridad 1: Si es turno de Horas Extras (overtime)
    if (row.shift_type === "overtime") {
      const otHorario = overtimeMap.get(`${row.agent_id}_${row.date}`);
      if (otHorario) {
        targetHorario = otHorario;
      } else if (
        row.horario_estipulado &&
        row.horario_estipulado.trim() !== "" &&
        row.horario_estipulado !== "--:--" &&
        row.horario_estipulado !== "Franco"
      ) {
        targetHorario = row.horario_estipulado.trim();
      }
    }

    // B. Prioridad 2: Si es turno normal en sábado, verificar rotación
    const [y, m, d] = row.date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();

    if (!targetHorario && dayOfWeek === 6 && row.shift_type === "normal") {
      const satH = resolveSaturdayRotation(row.agent_id, row.date);
      if (satH) {
        targetHorario = satH;
      }
    }

    // C. Prioridad 3: Turno en cronograma (schedules)
    if (!targetHorario) {
      const sched = sqlite
        .prepare("SELECT status, horario, is_override FROM schedules WHERE agent_name = ? AND date = ?")
        .get(agent.name, row.date) as any;

      if (sched) {
        if (
          sched.horario &&
          sched.horario.trim() !== "" &&
          sched.horario !== "Franco" &&
          sched.horario !== "-"
        ) {
          targetHorario = sched.horario.trim();
        } else if (sched.status === "Franco") {
          targetHorario = "--:--";
        }
      }
    }

    // D. Prioridad 4: Fallback a esquema semanal y horario por defecto del operador
    if (!targetHorario) {
      try {
        const dayName = daysMap[dayOfWeek];
        const weekly = agent.esquema_semanal ? JSON.parse(agent.esquema_semanal) : {};
        const hourly = agent.esquema_horario ? JSON.parse(agent.esquema_horario) : {};

        const status = weekly[dayName];
        const h = hourly[dayName];

        if (status === "Franco") {
          targetHorario = "--:--";
        } else if (h && h.trim() !== "" && h !== "-") {
          targetHorario = h.trim();
        } else if (
          agent.horario_default &&
          agent.horario_default.trim() !== "" &&
          agent.horario_default !== "-"
        ) {
          targetHorario = agent.horario_default.trim();
        } else {
          targetHorario = "--:--";
        }
      } catch (e) {
        targetHorario = "--:--";
      }
    }

    // E. Salvaguarda: si target dio '--:--' pero el operador asistió (entrada_real o cumplimiento)
    const hasWorked =
      Boolean(row.entrada_real && row.entrada_real.trim() !== "" && row.entrada_real !== "--:--") ||
      row.cumplimiento === "Cumplió" ||
      row.cumplimiento === "Llegada Tarde";

    if (targetHorario === "--:--" && hasWorked) {
      if (
        row.horario_estipulado &&
        row.horario_estipulado !== "--:--" &&
        row.horario_estipulado !== "Franco"
      ) {
        targetHorario = row.horario_estipulado.trim();
      } else if (row.asistencia === "HORAS EXTRAS" || row.shift_type === "overtime") {
        const entryH = row.entrada_real ? parseInt(row.entrada_real.split(":")[0], 10) : null;
        if (entryH === 20) targetHorario = "20:00 - 22:00";
        else if (entryH === 21) targetHorario = "21:00 - 01:00";
        else if (entryH === 17 || entryH === 16) targetHorario = "17:00 - 21:00";
        else if (entryH === 13) targetHorario = "13:00 - 17:00";
        else if (entryH === 9) targetHorario = "09:00 - 11:00";
        else if (entryH === 8) targetHorario = "08:00 - 11:00";
        else if (entryH === 7) targetHorario = "07:00 - 10:00";
        else if (entryH === 1) targetHorario = "01:00 - 05:00";
        else if (entryH === 5) targetHorario = "05:00 - 09:00";
        else targetHorario = "20:00 - 22:00";
        restoredAttendedFallbacks++;
      } else if (dayOfWeek === 6) {
        const satConf = getAgentSaturdayConfig(row.agent_id, row.date.substring(0, 7));
        const satH = satConf.horario || agent.saturday_horario;
        if (satH && satH.trim() !== "" && satH !== "-") {
          targetHorario = satH.trim();
        } else {
          targetHorario = "07:00 - 13:00";
        }
        restoredAttendedFallbacks++;
      } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if (
          agent.horario_default &&
          agent.horario_default.trim() !== "" &&
          agent.horario_default !== "-"
        ) {
          targetHorario = agent.horario_default.trim();
        }
        restoredAttendedFallbacks++;
      }
    }

    if (!targetHorario) targetHorario = "--:--";

    // Contadores estadísticos
    if (row.shift_type === "overtime" && targetHorario !== "--:--") {
      restoredOvertime++;
    } else if (dayOfWeek === 6 && targetHorario !== "--:--") {
      restoredSaturday++;
    } else if (targetHorario !== "--:--") {
      inheritedCronograma++;
    } else {
      confirmedFrancos++;
    }

    if (row.horario_estipulado !== targetHorario) {
      updateStmt.run(targetHorario, row.id);
    }
  }
});

updateTx();

console.log(`Horas Extras restauradas / normalizadas: ${restoredOvertime}`);
console.log(`Turnos de Sábado por rotación restaurados: ${restoredSaturday}`);
console.log(`Turnos regulares heredados de cronograma: ${inheritedCronograma}`);
console.log(`Casos de asistencia atendida con fallback seguro: ${restoredAttendedFallbacks}`);
console.log(`Francos confirmados (--:--): ${confirmedFrancos}`);

sqlite.close();
console.log("Normalización finalizada con éxito.");

