export enum OperatorStatus {
  PresencialMonteGrande = 'Presencial Monte Grande',
  PresencialParquePatricios = 'Presencial Parque Patricios',
  HomeOffice = 'Home Office',
  Licencia = 'Licencia',
  Vacaciones = 'Vacaciones',
  Franco = 'Franco',
}

export type StatusFilter = OperatorStatus | 'all';
export type LocationFilter = 'all' | 'Monte Grande' | 'Parque Patricios';

export interface OperatorData {
  id?: number;
  nombre: string;
  username?: string;
  horario: string;
  location?: string;
  asistencia: Record<string, OperatorStatus>;
  comentarios?: Record<string, string>;
  esquema_semanal?: Record<string, OperatorStatus>;
  esquema_horario?: Record<string, string>;
  horarios_dias?: Record<string, string>;
  entradas_reales?: Record<string, string>;
  salidas_reales?: Record<string, string>;
  breaks_inicio?: Record<string, string>;
  breaks_fin?: Record<string, string>;
  esquema_break_inicio?: Record<string, string>;
  esquema_break_fin?: Record<string, string>;
  maxConsecutiveHO?: number | null;
  minPWeek?: number | null;
  saturdayGroup?: string;
  saturdayHorario?: string;
  overrides?: Record<string, boolean>;
  weekendOvertimes?: WeekendOvertimeShift[];
}

export interface WeekendOvertimeShift {
  id: number;
  weekendStartDate: string; // "YYYY-MM-DD" (Saturday)
  agentId: number;
  date: string;             // "YYYY-MM-DD" (Saturday or Sunday)
  startTime: string;        // "HH:MM"
  endTime: string;          // "HH:MM"
}

export interface WeekendOvertimeConfig {
  id: number;
  weekendStartDate: string;
  referente: string;
}

export interface RulesConfig {
  minCoveragePercent: number;
  maxConsecutiveHOLimit: number;
  minPWeekLimit: number;
  maxLicenseOverlapLimit: number;
}
