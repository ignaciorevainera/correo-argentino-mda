import type { OperatorData, WeekendOvertimeConfig } from './types';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.error) {
        message = body.error;
      }
    } catch {
      // Body is not JSON, ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface CronogramaPayload {
  operators: OperatorData[];
  weekendOvertimeConfigs: WeekendOvertimeConfig[];
}

export async function fetchCronogramaFullData(month?: string): Promise<CronogramaPayload> {
  if (typeof window !== 'undefined' && (window as any).__CRONOGRAMA_INITIAL_DATA__) {
    const data = (window as any).__CRONOGRAMA_INITIAL_DATA__;
    delete (window as any).__CRONOGRAMA_INITIAL_DATA__;
    if (Array.isArray(data)) {
      return { operators: data, weekendOvertimeConfigs: [] };
    }
    return data as CronogramaPayload;
  }
  const url = month ? `/api/cronograma?month=${month}` : '/api/cronograma';
  return fetchJSON<CronogramaPayload>(url);
}

export async function fetchCronogramaData(month?: string): Promise<OperatorData[]> {
  const payload = await fetchCronogramaFullData(month);
  return payload.operators;
}

export interface EditPayload {
  agentName: string;
  date: string;
  status?: string;
  comment?: string;
  horario?: string;
  entradaReal?: string;
  salidaReal?: string;
  breakInicio?: string;
  breakFin?: string;
}

export async function saveEdits(edits: EditPayload[]): Promise<void> {
  await fetchJSON<void>('/api/cronograma', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits }),
  });
}

export async function fetchNotes(agentName: string): Promise<{ notes: string }> {
  return fetchJSON<{ notes: string }>(
    `/api/cronograma/notes?agentName=${encodeURIComponent(agentName)}`
  );
}

export async function saveNotes(agentName: string, notes: string): Promise<void> {
  await fetchJSON<void>('/api/cronograma/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName, notes }),
  });
}

export async function saveLocation(agentName: string, location: string): Promise<void> {
  await fetchJSON<void>('/api/cronograma/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName, location }),
  });
}

export async function saveOperatorRules(
  agentName: string,
  minPWeek: number | null,
  maxConsecutiveHO: number | null
): Promise<void> {
  await fetchJSON<void>('/api/cronograma/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName, minPWeek, maxConsecutiveHO }),
  });
}

export interface OperatorPayload {
  originalName?: string;
  name: string;
  username?: string;
  location?: string;
  horarioDefault?: string;
}

export async function createOperator(operator: OperatorPayload): Promise<any> {
  return fetchJSON<any>('/api/cronograma/operators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operator),
  });
}

export async function editOperator(operator: Required<Pick<OperatorPayload, 'originalName' | 'name'>> & OperatorPayload): Promise<any> {
  return fetchJSON<any>('/api/cronograma/operators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operator),
  });
}

export async function deleteOperator(name: string): Promise<any> {
  return fetchJSON<any>('/api/cronograma/operators', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function createMonth(year: number, month: number): Promise<void> {
  await fetchJSON<void>('/api/cronograma/months', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month }),
  });
}

export async function deleteMonth(year: number, month: number): Promise<void> {
  await fetchJSON<void>('/api/cronograma/months', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month }),
  });
}

export interface WeeklySchedulePayload {
  agentName: string;
  esquema_semanal: Record<string, string>;
  esquema_horario: Record<string, string>;
  esquema_break_inicio: Record<string, string>;
  esquema_break_fin: Record<string, string>;
}

export async function saveWeeklySchedules(
  weeklySchedules: WeeklySchedulePayload[],
  edits?: EditPayload[]
): Promise<void> {
  await fetchJSON<void>('/api/cronograma', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklySchedules, edits }),
  });
}
