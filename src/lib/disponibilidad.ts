import { db } from "@db/index";
import { agents, schedules, assignmentLock } from "@db/schema";
import { eq, and } from "drizzle-orm";

const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

export interface AgentDisponibilidad {
  agentId: number;
  nombre: string;
  username?: string;
  location: string;
  disponible: boolean;
  motivo?: string;            // "En break", "Fuera de horario", "Licencia", "Vacaciones", "Franco", etc.
  horarioHoy?: string;        // "08:00 - 17:00"
  breakInicioHoy?: string;    // "12:00"
  breakFinHoy?: string;       // "13:00"
  retornoEstimado?: string;   // "13:00"
  lastAutogestionAssignedAt: number | null;
  lastAutogestionAssignedBy?: string | null;
  lastAutogestionUndo?: number | null;
  modalidadHoy?: string;      // "Presencial", "Home Office", "Horas Extras", "Franco", etc.
  estadoExcepcional?: string;          // Tipo de excepción activa: "devolucion_supervisor" | "break_extendido" | "problema_tecnico"
  estadoExcepcionalMotivo?: string;    // Comentario del supervisor
  estadoExcepcionalAt?: number;        // Timestamp
  estadoExcepcionalMinutos?: number | null; // Tiempo extra para break extendido en minutos
}

export const EXCEPTION_LABELS: Record<string, string> = {
  devolucion_supervisor: "Devolución Supervisor",
  break_extendido: "Break Extendido",
  problema_tecnico: "Problema Técnico",
};

// Format date as YYYY-MM-DD using local time
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getDisponibilidadHoy(): Promise<AgentDisponibilidad[]> {
  const todayStr = getLocalDateString();
  const now = new Date();
  
  // Spanish day names mapping
  const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const dayName = dayNames[now.getDay()];

  // 1. Fetch all agents
  const dbAgents = await db.select().from(agents);

  // 2. Fetch today's persistent schedule overrides
  const dbSchedules = await db
    .select()
    .from(schedules)
    .where(eq(schedules.date, todayStr));

  // 3. Process each agent
  const list: AgentDisponibilidad[] = dbAgents.map((agent) => {
    const workingStatuses = ["Presencial Monte Grande", "Presencial Parque Patricios", "Home Office"];
    // Check if there is an override for this agent today
    const schedule = dbSchedules.find((s) => s.agentName === agent.name);

    let status = "Franco";
    let horario = "";
    let breakInicio = "";
    let breakFin = "";

    if (schedule) {
      status = schedule.status;
      horario = schedule.horario || "";
      breakInicio = schedule.breakInicio || "";
      breakFin = schedule.breakFin || "";
    } else {
      // Fallback to weekly schedule
      const esquemaSemanal = (agent.esquemaSemanal as Record<string, string>) || {};
      const esquemaHorario = (agent.esquemaHorario as Record<string, string>) || {};
      const esquemaBreakInicio = (agent.esquemaBreakInicio as Record<string, string>) || {};
      const esquemaBreakFin = (agent.esquemaBreakFin as Record<string, string>) || {};

      status = esquemaSemanal[dayName] ?? "Franco";
      horario = esquemaHorario[dayName] || "";
      breakInicio = esquemaBreakInicio[dayName] || "";
      breakFin = esquemaBreakFin[dayName] || "";
    }

    // Map database blank or invalid status to Franco
    if (!status || status.trim() === "") {
      status = "Franco";
    }

    // Fallback for horario if working but empty
    if (status !== "Franco" && (!horario || horario.trim() === "" || horario.trim() === "-")) {
      horario = agent.horarioDefault || "";
    }

    // Check if shift ended (auto-cleanup of exceptional state)
    let shiftEnded = false;
    if (!workingStatuses.includes(status)) {
      // Not a working day today
      shiftEnded = true;
    } else {
      const parts = horario.split(" - ");
      if (parts.length === 2) {
        const [_, endStr] = parts;
        const [hE, mE] = endStr.split(":").map(Number);
        if (!isNaN(hE) && !isNaN(mE)) {
          const endTime = new Date(now);
          endTime.setHours(hE, mE, 0, 0);
          if (now > endTime) {
            shiftEnded = true;
          }
        }
      }
    }


    const info: AgentDisponibilidad = {
      agentId: agent.id,
      nombre: agent.name,
      username: agent.username || undefined,
      location: agent.location || "Monte Grande",
      disponible: false,
      horarioHoy: horario || undefined,
      breakInicioHoy: breakInicio || undefined,
      breakFinHoy: breakFin || undefined,
      lastAutogestionAssignedAt: agent.lastAutogestionAssignedAt,
      lastAutogestionAssignedBy: agent.lastAutogestionAssignedBy,
      lastAutogestionUndo: agent.lastAutogestionUndo,
      modalidadHoy: status,
      estadoExcepcional: agent.estadoExcepcional || undefined,
      estadoExcepcionalMotivo: agent.estadoExcepcionalMotivo || undefined,
      estadoExcepcionalAt: agent.estadoExcepcionalAt || undefined,
      estadoExcepcionalMinutos: agent.estadoExcepcionalMinutos,
    };

    const applyOverride = () => {
      if (agent.estadoExcepcional) {
        info.disponible = false;
        info.motivo = EXCEPTION_LABELS[agent.estadoExcepcional] || agent.estadoExcepcional;
      }
    };

    // If status is not a working status, they are unavailable
    if (!workingStatuses.includes(status)) {
      info.disponible = false;
      info.motivo = status; // "Franco", "Vacaciones", "Licencia"
      applyOverride();
      return info;
    }

    // Parse the shift hours
    const parts = horario.split(" - ");
    if (parts.length !== 2) {
      info.disponible = false;
      info.motivo = "Fuera de horario";
      applyOverride();
      return info;
    }

    const [startStr, endStr] = parts;
    const [hS, mS] = startStr.split(":").map(Number);
    const [hE, mE] = endStr.split(":").map(Number);

    if (isNaN(hS) || isNaN(mS) || isNaN(hE) || isNaN(mE)) {
      info.disponible = false;
      info.motivo = "Fuera de horario";
      applyOverride();
      return info;
    }

    const startTime = new Date(now);
    startTime.setHours(hS, mS, 0, 0);

    const endTime = new Date(now);
    endTime.setHours(hE, mE, 0, 0);

    // Check if within shift
    if (now < startTime) {
      info.disponible = false;
      info.motivo = "Fuera de horario";
      info.retornoEstimado = startStr;
      applyOverride();
      return info;
    }

    if (now > endTime) {
      info.disponible = false;
      info.motivo = "Fuera de horario";
      applyOverride();
      return info;
    }

    // Check break times
    let breakStart: Date;
    let breakEnd: Date;

    if (breakInicio && breakFin) {
      const [bhS, bmS] = breakInicio.split(":").map(Number);
      const [bhE, bmE] = breakFin.split(":").map(Number);

      if (!isNaN(bhS) && !isNaN(bmS) && !isNaN(bhE) && !isNaN(bmE)) {
        breakStart = new Date(now);
        breakStart.setHours(bhS, bmS, 0, 0);
        breakEnd = new Date(now);
        breakEnd.setHours(bhE, bmE, 0, 0);
      } else {
        // Fallback calculation if breaks format is invalid
        const shiftDuration = endTime.getTime() - startTime.getTime();
        breakStart = new Date(startTime.getTime() + shiftDuration / 2 - 30 * 60000);
        breakEnd = new Date(breakStart.getTime() + 60 * 60000);
      }
    } else {
      // Estimate 1 hour break in the middle of the shift
      const shiftDuration = endTime.getTime() - startTime.getTime();
      breakStart = new Date(startTime.getTime() + shiftDuration / 2 - 30 * 60000);
      breakEnd = new Date(breakStart.getTime() + 60 * 60000);
    }

    // Auto-cleanup of break_extendido if it expired
    if (agent.estadoExcepcional === "break_extendido") {
      if (agent.estadoExcepcionalMinutos !== null && agent.estadoExcepcionalMinutos !== undefined) {
        const extraMinutes = agent.estadoExcepcionalMinutos;
        const extendedBreakEnd = new Date(breakEnd.getTime() + extraMinutes * 60000);
        if (now >= extendedBreakEnd) {
          // Clear in DB asynchronously
          db.update(agents)
            .set({
              estadoExcepcional: null,
              estadoExcepcionalMotivo: null,
              estadoExcepcionalAt: null,
              estadoExcepcionalMinutos: null,
            })
            .where(eq(agents.id, agent.id))
            .catch((err) =>
              console.error(`Error auto-clearing break_extendido state for agent ${agent.id}:`, err)
            );

          // Mutate local object and info so we don't apply the override in this render
          agent.estadoExcepcional = null;
          agent.estadoExcepcionalMotivo = null;
          agent.estadoExcepcionalAt = null;
          agent.estadoExcepcionalMinutos = null;
          
          info.estadoExcepcional = undefined;
          info.estadoExcepcionalMotivo = undefined;
          info.estadoExcepcionalAt = undefined;
          info.estadoExcepcionalMinutos = undefined;
        } else {
          // Format return time
          const retHours = String(extendedBreakEnd.getHours()).padStart(2, "0");
          const retMins = String(extendedBreakEnd.getMinutes()).padStart(2, "0");
          info.retornoEstimado = `${retHours}:${retMins}`;
        }
      } else {
        // Manual / No auto-cleanup
        info.retornoEstimado = "Manual";
      }
    }

    // Check if currently in break
    if (now >= breakStart && now <= breakEnd) {
      info.disponible = false;
      info.motivo = "En break";
      
      // Format return time if not already set
      if (!info.retornoEstimado) {
        const retHours = String(breakEnd.getHours()).padStart(2, "0");
        const retMins = String(breakEnd.getMinutes()).padStart(2, "0");
        info.retornoEstimado = `${retHours}:${retMins}`;
      }
      applyOverride();
      return info;
    }

    // If we passed all checks, agent is available
    info.disponible = true;
    applyOverride();
    return info;
  });

  return list;
}

export async function asignarSiguienteAutogestion(assignedBy: string = "Sistema"): Promise<{
  success: boolean;
  agent?: AgentDisponibilidad;
  error?: string;
}> {
  const list = await getDisponibilidadHoy();
  const available = list.filter((a) => a.disponible);

  if (available.length === 0) {
    return {
      success: false,
      error: "No hay operadores disponibles o dentro de horario operativo para asignar.",
    };
  }

  // Sort by lastAutogestionAssignedAt ASC
  // Agents who have never been assigned (null) go first
  available.sort((a, b) => {
    const tA = a.lastAutogestionAssignedAt ?? 0;
    const tB = b.lastAutogestionAssignedAt ?? 0;
    
    if (a.lastAutogestionAssignedAt === null && b.lastAutogestionAssignedAt !== null) return -1;
    if (a.lastAutogestionAssignedAt !== null && b.lastAutogestionAssignedAt === null) return 1;
    
    return tA - tB;
  });

  const winner = available[0];
  const now = Date.now();

  // Clear any existing undo states
  await db
    .update(agents)
    .set({ lastAutogestionUndo: null });

  const prevValue = winner.lastAutogestionAssignedAt;

  // Update in DB
  await db
    .update(agents)
    .set({ 
      lastAutogestionAssignedAt: now,
      lastAutogestionAssignedBy: assignedBy,
      lastAutogestionUndo: prevValue
    })
    .where(eq(agents.id, winner.agentId));

  winner.lastAutogestionAssignedAt = now;
  winner.lastAutogestionAssignedBy = assignedBy;
  winner.lastAutogestionUndo = prevValue;
  
  return {
    success: true,
    agent: winner,
  };
}

export async function asignarManual(agentId: number, assignedBy: string = "Sistema"): Promise<{ success: boolean; error?: string }> {
  // Clear any existing undo states
  await db
    .update(agents)
    .set({ lastAutogestionUndo: null });

  // Get current state to preserve
  const [ag] = await db.select().from(agents).where(eq(agents.id, agentId));
  const prevValue = ag ? ag.lastAutogestionAssignedAt : null;

  // Update lastAutogestionAssignedAt for the manually assigned agent
  await db
    .update(agents)
    .set({ 
      lastAutogestionAssignedAt: Date.now(),
      lastAutogestionAssignedBy: assignedBy,
      lastAutogestionUndo: prevValue
    })
    .where(eq(agents.id, agentId));
  return { success: true };
}

export async function marcarEstadoExcepcional(
  agentId: number,
  tipo: string,
  motivo?: string,
  tiempoExtra?: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(agents)
      .set({
        estadoExcepcional: tipo,
        estadoExcepcionalMotivo: motivo || null,
        estadoExcepcionalAt: Date.now(),
        estadoExcepcionalMinutos: tiempoExtra || null,
      })
      .where(eq(agents.id, agentId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al marcar estado excepcional" };
  }
}

export async function limpiarEstadoExcepcional(
  agentId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(agents)
      .set({
        estadoExcepcional: null,
        estadoExcepcionalMotivo: null,
        estadoExcepcionalAt: null,
        estadoExcepcionalMinutos: null,
      })
      .where(eq(agents.id, agentId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al limpiar estado excepcional" };
  }
}

export async function deshacerAsignacion(): Promise<{ success: boolean; agentName?: string; error?: string }> {
  const all = await db.select().from(agents);
  const target = all.find(a => a.lastAutogestionUndo !== null);
  if (!target) {
    return { success: false, error: "No hay ninguna asignación para deshacer." };
  }

  const restoredTime = target.lastAutogestionUndo;
  await db
    .update(agents)
    .set({
      lastAutogestionAssignedAt: restoredTime,
      lastAutogestionUndo: null
    })
    .where(eq(agents.id, target.id));

  return { success: true, agentName: target.name };
}

export function isLockExpired(lastActivityAt: number, releaseRequested: boolean = false): boolean {
  const timeout = releaseRequested ? 1 * 60 * 1000 : LOCK_TIMEOUT_MS;
  return Date.now() > lastActivityAt + timeout;
}

export async function getLockStatus(): Promise<
  { status: "free" } |
  { status: "occupied"; user: { userId: number; username: string; acquiredAt: number; lastActivityAt: number; releaseRequested: boolean } } |
  { status: "expired"; user: { userId: number; username: string; lastActivityAt: number } }
> {
  const [current] = await db.select().from(assignmentLock).where(eq(assignmentLock.id, 1));
  if (!current) return { status: "free" };
  const isExpired = isLockExpired(current.lastActivityAt, current.releaseRequested === 1);
  if (isExpired) {
    return { status: "expired", user: { userId: current.userId, username: current.username, lastActivityAt: current.lastActivityAt } };
  }
  return {
    status: "occupied",
    user: {
      userId: current.userId,
      username: current.username,
      acquiredAt: current.acquiredAt,
      lastActivityAt: current.lastActivityAt,
      releaseRequested: current.releaseRequested === 1,
    },
  };
}

export async function acquireLock(userId: number, username: string): Promise<{ success: true } | { success: false; reason: "occupied"; holder: string } | { success: false; reason: "race_condition" }> {
  return db.transaction((tx) => {
    const currentList = tx.select().from(assignmentLock).where(eq(assignmentLock.id, 1)).all();
    const current = currentList[0];
    const now = Date.now();
    if (current) {
      const isExpired = isLockExpired(current.lastActivityAt, current.releaseRequested === 1);
      if (isExpired) {
        tx.update(assignmentLock).set({
          userId, username, acquiredAt: now, lastActivityAt: now, releaseRequested: 0
        }).where(eq(assignmentLock.id, 1)).run();
        return { success: true };
      } else if (current.userId !== userId) {
        return { success: false, reason: "occupied" as const, holder: current.username };
      } else {
        tx.update(assignmentLock).set({
          lastActivityAt: now, releaseRequested: 0
        }).where(eq(assignmentLock.id, 1)).run();
        return { success: true };
      }
    }
    try {
      tx.insert(assignmentLock).values({
        id: 1, userId, username, acquiredAt: now, lastActivityAt: now, releaseRequested: 0,
      }).run();
      return { success: true };
    } catch {
      return { success: false, reason: "race_condition" as const };
    }
  });
}

export async function releaseLock(userId: number, isAdmin: boolean = false): Promise<boolean> {
  if (isAdmin) {
    await db.delete(assignmentLock).where(eq(assignmentLock.id, 1));
    return true;
  }
  const [current] = await db.select({ userId: assignmentLock.userId }).from(assignmentLock).where(eq(assignmentLock.id, 1));
  if (!current) return true;
  if (current.userId !== userId) return false;
  await db.delete(assignmentLock).where(eq(assignmentLock.id, 1));
  return true;
}

export async function heartbeatLock(userId: number): Promise<void> {
  await db.update(assignmentLock)
    .set({ lastActivityAt: Date.now() })
    .where(and(eq(assignmentLock.id, 1), eq(assignmentLock.userId, userId)));
}

export async function requestRelease(): Promise<void> {
  const currentList = await db.select().from(assignmentLock).where(eq(assignmentLock.id, 1));
  const current = currentList[0];
  if (!current) return;
  const now = Date.now();
  const remaining = (current.lastActivityAt + LOCK_TIMEOUT_MS) - now;
  if (remaining > 60000) {
    await db.update(assignmentLock)
      .set({ releaseRequested: 1, lastActivityAt: now })
      .where(eq(assignmentLock.id, 1));
  } else {
    await db.update(assignmentLock)
      .set({ releaseRequested: 1 })
      .where(eq(assignmentLock.id, 1));
  }
}

export async function rejectRelease(userId: number): Promise<boolean> {
  const [current] = await db.select().from(assignmentLock).where(eq(assignmentLock.id, 1));
  if (!current || current.userId !== userId) return false;
  await db.update(assignmentLock)
    .set({ releaseRequested: 0, lastActivityAt: Date.now() })
    .where(eq(assignmentLock.id, 1));
  return true;
}

export async function resetAssignmentLock(): Promise<void> {
  await db.update(assignmentLock)
    .set({ lastActivityAt: Date.now(), releaseRequested: 0 })
    .where(eq(assignmentLock.id, 1));
}

import { jsonError } from "@lib/apiResponse";

export async function ensureHasLock(locals: App.Locals): Promise<{ ok: true } | { ok: false; response: Response }> {
  const status = await getLockStatus();
  if (status.status === "free" || status.status === "expired") {
    return {
      ok: false,
      response: jsonError("No tenés el control de asignación. Tomá el control primero.", 423),
    };
  }
  if (status.user.userId !== locals.user?.id) {
    return {
      ok: false,
      response: jsonError(`El control está en manos de ${status.user.username}`, 423),
    };
  }
  await heartbeatLock(locals.user.id);
  return { ok: true };
}
