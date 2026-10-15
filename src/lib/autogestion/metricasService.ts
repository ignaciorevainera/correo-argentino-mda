import { db } from "@db/index";
import { assignmentHistory } from "@db/schema";
import { gte, lte, and, desc } from "drizzle-orm";
import { getUnassignedTicketsByHelpdesk } from "@/lib/invgate/agsTickets";
import { AGS_HELPDESK_ID } from "@/lib/invgate/agsHelpdesk";

export type DateRangePreset =
  | "hoy"
  | "ayer"
  | "ultimos_7_dias"
  | "ultimos_30_dias"
  | "mes_actual"
  | "custom";

export interface ParsedDateRange {
  preset: DateRangePreset;
  fromMs: number;
  toMs: number;
  grouping: "hour" | "day";
}

export function parseDateRange(
  preset?: string,
  from?: string,
  to?: string,
  referenceDate: Date = new Date()
): ParsedDateRange {
  const p = (preset || "ultimos_7_dias") as DateRangePreset;
  const now = new Date(referenceDate);

  if (p === "hoy") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { preset: "hoy", fromMs: start.getTime(), toMs: end.getTime(), grouping: "hour" };
  }

  if (p === "ayer") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
    const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
    return { preset: "ayer", fromMs: start.getTime(), toMs: end.getTime(), grouping: "hour" };
  }

  if (p === "ultimos_7_dias") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset: "ultimos_7_dias", fromMs: start.getTime(), toMs: end.getTime(), grouping: "day" };
  }

  if (p === "ultimos_30_dias") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { preset: "ultimos_30_dias", fromMs: start.getTime(), toMs: end.getTime(), grouping: "day" };
  }

  if (p === "mes_actual") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { preset: "mes_actual", fromMs: start.getTime(), toMs: end.getTime(), grouping: "day" };
  }

  // Custom from/to
  let fromMs = from ? new Date(from).getTime() : NaN;
  let toMs = to ? new Date(to).getTime() : NaN;

  if (isNaN(fromMs) || isNaN(toMs)) {
    // Fallback to 7 days
    const fallbackStart = new Date(now);
    fallbackStart.setDate(fallbackStart.getDate() - 6);
    fallbackStart.setHours(0, 0, 0, 0);
    fromMs = fallbackStart.getTime();
    toMs = now.getTime();
  }

  if (toMs < fromMs) {
    const temp = fromMs;
    fromMs = toMs;
    toMs = temp;
  }

  const diffDays = (toMs - fromMs) / (1000 * 60 * 60 * 24);
  const grouping = diffDays <= 2 ? "hour" : "day";

  return { preset: "custom", fromMs, toMs, grouping };
}

export function aggregateTemporal(
  records: Array<{ assignedAt: number }>,
  grouping: "hour" | "day",
  fromMs: number,
  toMs: number
): Array<{ label: string; count: number }> {
  const buckets: Record<string, number> = {};

  if (grouping === "hour") {
    // Generar buckets para cada hora
    const cur = new Date(fromMs);
    cur.setMinutes(0, 0, 0);
    const end = new Date(toMs);
    while (cur.getTime() <= end.getTime()) {
      const hStr = `${String(cur.getHours()).padStart(2, "0")}:00`;
      const dateStr = `${cur.getDate()}/${cur.getMonth() + 1}`;
      const key = `${dateStr} ${hStr}`;
      buckets[key] = 0;
      cur.setHours(cur.getHours() + 1);
    }
  } else {
    // Generar buckets para cada día
    const cur = new Date(fromMs);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(toMs);
    while (cur.getTime() <= end.getTime()) {
      const d = String(cur.getDate()).padStart(2, "0");
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const key = `${d}/${m}`;
      buckets[key] = 0;
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Llenar datos reales
  for (const rec of records) {
    const date = new Date(rec.assignedAt);
    let key = "";
    if (grouping === "hour") {
      const hStr = `${String(date.getHours()).padStart(2, "0")}:00`;
      const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
      key = `${dateStr} ${hStr}`;
    } else {
      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      key = `${d}/${m}`;
    }
    if (buckets[key] !== undefined) {
      buckets[key]++;
    } else {
      buckets[key] = 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, count }));
}

export function aggregateByOperator(
  records: Array<{ agentId: number; agentName: string }>
): Array<{ agentId: number; agentName: string; count: number }> {
  const map = new Map<number, { agentName: string; count: number }>();

  for (const r of records) {
    const existing = map.get(r.agentId);
    if (existing) {
      existing.count++;
    } else {
      map.set(r.agentId, { agentName: r.agentName, count: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([agentId, data]) => ({ agentId, ...data }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateByType(
  records: Array<{ type: string }>
): Array<{ type: string; label: string; count: number }> {
  const TYPE_LABELS: Record<string, string> = {
    cyclic: "Cíclica General",
    manual: "Manual Supervisor",
    batch_suggested: "Sugerida Creador",
    batch_all: "Masiva en Cola",
    revision: "Revisión Pospuesta",
    undo: "Deshecha",
  };

  const map = new Map<string, number>();

  for (const r of records) {
    const t = r.type || "cyclic";
    map.set(t, (map.get(t) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([type, count]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function calculateKpis(
  records: Array<{ id: number; agentId: number; type: string }>,
  unassignedCount: number
): {
  totalAsignadas: number;
  colaPendiente: number;
  tasaAutomatizacion: number;
  operadoresActivos: number;
} {
  const totalAsignadas = records.length;
  const uniqueAgents = new Set(records.map((r) => r.agentId));
  const automatedCount = records.filter(
    (r) => r.type === "cyclic" || r.type === "batch_suggested" || r.type === "batch_all"
  ).length;

  const tasaAutomatizacion =
    totalAsignadas > 0 ? Math.round((automatedCount / totalAsignadas) * 100) : 0;

  return {
    totalAsignadas,
    colaPendiente: unassignedCount,
    tasaAutomatizacion,
    operadoresActivos: uniqueAgents.size,
  };
}

export function aggregateInvgateQueue(
  tickets: Array<{
    category_last_name?: string;
    category_name?: string;
    creator_name?: string;
    location_name?: string;
  }>
): {
  byCategory: Array<{ label: string; count: number }>;
  topCreators: Array<{ label: string; count: number }>;
} {
  const catMap = new Map<string, number>();
  const creatorMap = new Map<string, number>();

  for (const t of tickets) {
    const cat = t.category_last_name || t.category_name || "Sin Categoría";
    catMap.set(cat, (catMap.get(cat) || 0) + 1);

    const creator = t.creator_name || t.location_name || "Desconocido";
    creatorMap.set(creator, (creatorMap.get(creator) || 0) + 1);
  }

  const byCategory = Array.from(catMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topCreators = Array.from(creatorMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { byCategory, topCreators };
}

export function generateCsvExport(
  records: Array<{
    id: number;
    ticketNumber: string | null;
    agentName: string;
    assignedBy: string;
    assignedAt: number;
    type: string;
  }>
): string {
  const headers = ["ID", "Ticket", "Operador", "Asignado Por", "Tipo", "Fecha Hora"];
  const rows = records.map((r) => [
    r.id,
    `"${(r.ticketNumber || "").replace(/"/g, '""')}"`,
    `"${(r.agentName || "").replace(/"/g, '""')}"`,
    `"${(r.assignedBy || "").replace(/"/g, '""')}"`,
    `"${(r.type || "").replace(/"/g, '""')}"`,
    `"${new Date(r.assignedAt).toLocaleString()}"`,
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
}

export function getMockMetricasData(preset?: string, from?: string, to?: string) {
  const range = parseDateRange(preset, from, to);
  const now = Date.now();

  const mockOperators = [
    { id: 101, name: "María González" },
    { id: 102, name: "Lucas Benítez" },
    { id: 103, name: "Florencia Álvarez" },
    { id: 104, name: "Martín Rodríguez" },
    { id: 105, name: "Camila Díaz" },
    { id: 106, name: "Facundo Romero" },
    { id: 107, name: "Julieta Sosa" },
    { id: 108, name: "Ignacio Torres" },
  ];

  const types = ["cyclic", "cyclic", "batch_suggested", "batch_all", "manual", "revision"];
  const creators = [
    "Sucursal 1400 - La Plata",
    "Sucursal 1640 - Martínez",
    "Sucursal 5000 - Córdoba Centro",
    "Sucursal 2000 - Rosario",
    "Sucursal 3000 - Santa Fe",
    "Sucursal 7600 - Mar del Plata",
    "Planta Logística Monte Grande",
    "Atención al Cliente Web",
  ];
  const categories = [
    "Reclamo de Envíos Nacionales",
    "Consulta de Imposición / Seguimiento",
    "Modificación de Domicilio",
    "Retención en Sucursal",
    "Soporte Sistema Paquetería",
    "Alta de Carta Documento Digital",
    "Validación de Identidad Portal",
  ];

  // Generar asignaciones aleatorias simuladas
  const mockRecords: Array<{
    id: number;
    agentId: number;
    agentName: string;
    ticketNumber: string;
    assignedBy: string;
    assignedAt: number;
    type: string;
  }> = [];

  const spanMs = range.toMs - range.fromMs;
  const count = range.grouping === "hour" ? 45 : 280;

  for (let i = 1; i <= count; i++) {
    const op = mockOperators[Math.floor(Math.random() * mockOperators.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const assignedAt = range.fromMs + Math.floor(Math.random() * spanMs);
    const ticketId = 150000 + Math.floor(Math.random() * 8500);

    mockRecords.push({
      id: i,
      agentId: op.id,
      agentName: op.name,
      ticketNumber: `#${ticketId}`,
      assignedBy: type === "manual" ? "supervisor" : "Sistema MDA (AGS Bot)",
      assignedAt,
      type,
    });
  }

  mockRecords.sort((a, b) => b.assignedAt - a.assignedAt);

  // Simular cola en espera de InvGate
  const mockUnassigned = [];
  const pendingCount = 38;
  for (let i = 0; i < pendingCount; i++) {
    mockUnassigned.push({
      category_name: categories[Math.floor(Math.random() * categories.length)],
      creator_name: creators[Math.floor(Math.random() * creators.length)],
    });
  }

  const kpis = calculateKpis(mockRecords, pendingCount);
  const temporal = aggregateTemporal(mockRecords, range.grouping, range.fromMs, range.toMs);
  const byOperator = aggregateByOperator(mockRecords);
  const byType = aggregateByType(mockRecords);
  const queueStats = aggregateInvgateQueue(mockUnassigned);

  return {
    range,
    kpis,
    temporal,
    byOperator,
    byType,
    queueStats,
    recentAssignments: mockRecords.slice(0, 50),
    lastSyncAt: now,
    isMock: true,
  };
}

export async function getAutogestionesMetricasData(
  preset?: string,
  from?: string,
  to?: string,
  forceMock?: boolean
) {
  if (forceMock) {
    return getMockMetricasData(preset, from, to);
  }
  const range = parseDateRange(preset, from, to);

  // 1. Obtener registros de assignment_history en el rango solicitado
  const records = await db
    .select()
    .from(assignmentHistory)
    .where(
      and(
        gte(assignmentHistory.assignedAt, range.fromMs),
        lte(assignmentHistory.assignedAt, range.toMs)
      )
    )
    .orderBy(desc(assignmentHistory.assignedAt));

  // 2. Obtener cola en vivo de InvGate
  let unassignedTickets: any[] = [];
  try {
    const queueRes = await getUnassignedTicketsByHelpdesk(AGS_HELPDESK_ID);
    if (queueRes.ok && queueRes.tickets) {
      unassignedTickets = queueRes.tickets;
    }
  } catch (err) {
    console.error("Error fetching InvGate queue for metrics:", err);
  }

  // 3. Procesar agregaciones
  const kpis = calculateKpis(records, unassignedTickets.length);
  const temporal = aggregateTemporal(records, range.grouping, range.fromMs, range.toMs);
  const byOperator = aggregateByOperator(records);
  const byType = aggregateByType(records);
  const queueStats = aggregateInvgateQueue(unassignedTickets);

  return {
    range,
    kpis,
    temporal,
    byOperator,
    byType,
    queueStats,
    recentAssignments: records.slice(0, 50),
    lastSyncAt: Date.now(),
  };
}
