import type { OperatorData } from './types';
import { OperatorStatus } from './types';
import feriadosJson from './feriados.json';

export function safeGetItem(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // silently fail in private browsing mode
  }
}

export interface PasivaState {
  operatorId: number | null;
  originalOperatorId: number | null;
  weeklyAssignments: Record<
    string,
    {
      supervisorName: string;
      referenteId: number | null;
      endDate?: string;
      originalSupervisorName: string;
      originalReferenteId: number | null;
    }
  >;
}

class CronogramaState {
  private _cronoData: OperatorData[] = [];
  
  // Cache for computed properties
  private _cachedDates: string[] | null = null;
  private _cachedMonths: string[] | null = null;
  private _cachedWeeklyTemplates: Record<string, { dias: Record<string, OperatorStatus>; horarios: Record<string, string>; breaks_inicio?: Record<string, string>; breaks_fin?: Record<string, string> }> | null = null;
  availableMonths: string[] = [];

  feriados: Record<string, string> = feriadosJson;
  isEditMode = false;
  activeBrush: string | null = null;
  pendingEdits: Record<string, { agentName: string; date: string; status: string; originalStatus: string }> = {};
  modifiedSchedules: { agentName: string; date: string; status: string }[] = [];
  searchQuery = '';
  activeFilter = 'all';
  activeLocationFilter = 'all';
  activeSort = 'alphabetical';
  activeDetailTrigger: HTMLElement | null = null;
  focusedDateStr: string | null = null;

  pasivaState: PasivaState | null = null;

  get hasPendingPasivaEdits(): boolean {
    if (!this.pasivaState) return false;
    if (this.pasivaState.operatorId !== this.pasivaState.originalOperatorId) return true;
    for (const week of Object.values(this.pasivaState.weeklyAssignments)) {
      if (week.supervisorName !== week.originalSupervisorName) return true;
      if (week.referenteId !== week.originalReferenteId) return true;
    }
    return false;
  }

  resetPasivaEdits(): void {
    if (!this.pasivaState) return;
    this.pasivaState.operatorId = this.pasivaState.originalOperatorId;
    for (const key of Object.keys(this.pasivaState.weeklyAssignments)) {
      const assignment = this.pasivaState.weeklyAssignments[key];
      assignment.supervisorName = assignment.originalSupervisorName;
      assignment.referenteId = assignment.originalReferenteId;
    }
  }

  // Rule settings
  get minCoveragePercent(): number {
    return parseInt(safeGetItem('cronoMinCoverage', '40'), 10);
  }
  set minCoveragePercent(val: number) {
    safeSetItem('cronoMinCoverage', val.toString());
  }

  get maxConsecutiveHOLimit(): number {
    return parseInt(safeGetItem('cronoMaxConsecutiveHO', '5'), 10);
  }
  set maxConsecutiveHOLimit(val: number) {
    safeSetItem('cronoMaxConsecutiveHO', val.toString());
  }

  get minPWeekLimit(): number {
    return parseInt(safeGetItem('cronoMinPWeek', '2'), 10);
  }
  set minPWeekLimit(val: number) {
    safeSetItem('cronoMinPWeek', val.toString());
  }

  get maxLicenseOverlapLimit(): number {
    return parseInt(safeGetItem('cronoMaxLicenseOverlap', '2'), 10);
  }
  set maxLicenseOverlapLimit(val: number) {
    safeSetItem('cronoMaxLicenseOverlap', val.toString());
  }

  get isCoverageMinimized(): boolean {
    return safeGetItem('cronoCoverageMinimized', 'false') === 'true';
  }
  set isCoverageMinimized(val: boolean) {
    safeSetItem('cronoCoverageMinimized', val ? 'true' : 'false');
  }

  get isTotalsCollapsed(): boolean {
    return safeGetItem('cronoTotalsCollapsed', 'false') === 'true';
  }
  set isTotalsCollapsed(val: boolean) {
    safeSetItem('cronoTotalsCollapsed', val ? 'true' : 'false');
  }

  get cronoData(): OperatorData[] {
    return this._cronoData;
  }
  set cronoData(data: OperatorData[]) {
    this._cronoData = data;
    this.invalidateCache();
  }

  invalidateCache() {
    this._cachedDates = null;
    this._cachedMonths = null;
  }

  get uniqueDates(): string[] {
    if (this._cachedDates) return this._cachedDates;
    const datesSet = new Set(this._cronoData.flatMap(op => Object.keys(op.asistencia || {})));
    this._cachedDates = Array.from(datesSet).sort();
    return this._cachedDates;
  }

  get uniqueMonths(): string[] {
    if (this.availableMonths && this.availableMonths.length > 0) {
      return this.availableMonths;
    }
    if (this._cachedMonths) return this._cachedMonths;
    const monthsSet = new Set(this.uniqueDates.map(d => d.slice(0, 7)));
    this._cachedMonths = Array.from(monthsSet).sort();
    return this._cachedMonths;
  }

  get weeklyTemplates(): Record<string, { dias: Record<string, OperatorStatus>; horarios: Record<string, string>; breaks_inicio?: Record<string, string>; breaks_fin?: Record<string, string> }> {
    if (this._cachedWeeklyTemplates) return this._cachedWeeklyTemplates;
    try {
      const stored = safeGetItem('cronoWeeklyTemplatesV2', '{}');
      const templates = JSON.parse(stored);
      if (Object.keys(templates).length === 0) {
        // Return default templates if empty
        const defaultTemplates = {
          "Estándar P/HO Alternado": {
            dias: { Lunes: OperatorStatus.PresencialMonteGrande, Martes: OperatorStatus.HomeOffice, Miercoles: OperatorStatus.PresencialMonteGrande, Jueves: OperatorStatus.HomeOffice, Viernes: OperatorStatus.PresencialMonteGrande },
            horarios: { Lunes: "08:00 - 17:00", Martes: "08:00 - 17:00", Miercoles: "08:00 - 17:00", Jueves: "08:00 - 17:00", Viernes: "08:00 - 17:00" }
          },
          "100% Presencial": {
            dias: { Lunes: OperatorStatus.PresencialMonteGrande, Martes: OperatorStatus.PresencialMonteGrande, Miercoles: OperatorStatus.PresencialMonteGrande, Jueves: OperatorStatus.PresencialMonteGrande, Viernes: OperatorStatus.PresencialMonteGrande },
            horarios: { Lunes: "08:00 - 17:00", Martes: "08:00 - 17:00", Miercoles: "08:00 - 17:00", Jueves: "08:00 - 17:00", Viernes: "08:00 - 17:00" }
          },
          "100% Home Office": {
            dias: { Lunes: OperatorStatus.HomeOffice, Martes: OperatorStatus.HomeOffice, Miercoles: OperatorStatus.HomeOffice, Jueves: OperatorStatus.HomeOffice, Viernes: OperatorStatus.HomeOffice },
            horarios: { Lunes: "08:00 - 17:00", Martes: "08:00 - 17:00", Miercoles: "08:00 - 17:00", Jueves: "08:00 - 17:00", Viernes: "08:00 - 17:00" }
          }
        };
        this._cachedWeeklyTemplates = defaultTemplates;
        return defaultTemplates;
      }
      this._cachedWeeklyTemplates = templates;
      return templates;
    } catch {
      return {};
    }
  }

  set weeklyTemplates(val: Record<string, { dias: Record<string, OperatorStatus>; horarios: Record<string, string>; breaks_inicio?: Record<string, string>; breaks_fin?: Record<string, string> }>) {
    this._cachedWeeklyTemplates = val;
    safeSetItem('cronoWeeklyTemplatesV2', JSON.stringify(val));
  }
}

export const state = new CronogramaState();
export type { CronogramaState };
