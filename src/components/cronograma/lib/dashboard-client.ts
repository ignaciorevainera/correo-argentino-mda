import { state, safeGetItem, safeSetItem } from './state';
import { fetchCronogramaData, fetchCronogramaFullData, saveEdits, deleteOperator, deleteMonth } from './api';
import { getStatusStyles } from './styles';
import { 
  getGanttPosition, 
  getDaysInMonth, 
  formatYMD, 
  formatDMY, 
  escapeHtml, 
  isCurrentlyWorking, 
  debounce, 
  timeToMinutes
} from './utils';
import { updateButtonGroupState, STATUS_FILTER_CONFIGS, LOCATION_FILTER_CONFIG } from './filters';
import { exportCSV, exportAsImage, exportAsClipboardImage } from './exporters';
import { showToast, showConfirm } from './notifications';
import { OperatorStatus, type OperatorData, type WeekendOvertimeShift, type WeekendOvertimeConfig } from './types';
import { isFeriado, getFeriadoName } from './feriados';

// Submodule imports
import {
  activeRotationConfig,
  setActiveRotationConfig,
  rotationTimelineSelectedDate,
  setRotationTimelineSelectedDate,
  getActiveGroupForDate,
  getNextSaturdayForGroup,
  loadRotationConfig,
  renderRotationTimeline,
  formatToDDMMYY,
  setupRotationEventListeners
} from './rotation-helper';

import {
  overtimeConfigs,
  setOvertimeConfigs,
  overtimeSelectedWeekend,
  setOvertimeSelectedWeekend,
  showOvertimeView,
  renderOvertimeView,
  refreshOvertimeForWeekend,
  setupOvertimeEventListeners
} from './overtime-view';

import {
  hasPasivaChanges,
  updatePasivaToolbarUI,
  savePasivaChanges,
  discardPasivaChanges,
  showPasivaView,
  renderPasivaView,
  setupPasivaEventListeners
} from './pasiva-view';

import {
  updateMonthDisplay,
  updateNavigationButtons,
  updateGroupsActiveMonthBadge,
  renderMonthDropdown,
  changeMonth,
  renderDaily,
  renderHourly,
  renderMonthly
} from './monthly-view';

export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const dateObj = new Date(dateStr + "T12:00:00");
  const day = dateObj.getDay();
  return day === 6 || day === 0;
}

export function resolveOperatorStatusAndHorario(
  op: OperatorData,
  dateStr: string,
  cachedDayOfWeek?: number,
  cachedActiveGroup?: string | null
): { status: OperatorStatus; horario: string } {
  let status = op.asistencia[dateStr] || OperatorStatus.Franco;
  let horario = (op.horarios_dias && op.horarios_dias[dateStr]) || op.horario || "";

  const dayOfWeek = cachedDayOfWeek !== undefined ? cachedDayOfWeek : new Date(dateStr + "T12:00:00").getDay();
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekendDay) {
    const isSaturday = dayOfWeek === 6;
    if (isSaturday && op.saturdayGroup) {
      const activeGroup = cachedActiveGroup !== undefined ? cachedActiveGroup : getActiveGroupForDate(dateStr);
      const isOverride = status === OperatorStatus.Vacaciones || status === OperatorStatus.Licencia;
      
      if (op.saturdayGroup === activeGroup && !isOverride) {
        status = OperatorStatus.HomeOffice;
        horario = op.saturdayHorario || "07:00 - 13:00";
      }
    }
  }

  return { status, horario };
}

export function getDatesArrayForCurrentMonth(): string[] {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  if (!dateInput || !dateInput.value) return [];

  const [year, month] = dateInput.value.split('-').map(Number);
  const totalDays = getDaysInMonth(year, month - 1);
  const dates: string[] = [];
  for (let i = 1; i <= totalDays; i++) {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    dates.push(dStr);
  }
  return dates;
}

export function updateDateInputDisplay(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const dateDisplay = document.getElementById('date-input-display');

  if (dateInput && dateDisplay && dateInput.value) {
    dateDisplay.innerText = formatDMY(dateInput.value);
  }
}

export function sortOperators(ops: OperatorData[], dateStr: string): OperatorData[] {
  const sortType = state.activeSort || 'alphabetical';
  
  let referenceDate = dateStr;
  const isDailyActive = !document.getElementById('daily-view')?.classList.contains('hidden');
  if (!isDailyActive) {
    const today = new Date();
    const todayStr = formatYMD(today);
    if (todayStr.slice(0, 7) === dateStr.slice(0, 7)) {
      referenceDate = todayStr;
    }
  }
  
  const hasContinuation = (op: OperatorData): boolean => {
    const parts = referenceDate.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month, day);
    dateObj.setDate(dateObj.getDate() - 1);
    
    const yStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    
    const yesterdayStatus = op.asistencia?.[yStr];
    if (!yesterdayStatus) return false;
    
    const isYesterdayAbsent = yesterdayStatus === 'Licencia' || yesterdayStatus === 'Vacaciones' || yesterdayStatus === 'Franco';
    if (isYesterdayAbsent) return false;
    
    const yesterdayHorario = (op.horarios_dias && op.horarios_dias[yStr]) || op.horario;
    if (!yesterdayHorario) return false;
    
    const times = yesterdayHorario.split(' - ');
    if (times.length === 2) {
      const getMins = (t: string) => {
        const p = t.split(':');
        return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
      };
      const startPct = getMins(times[0]);
      const endPct = getMins(times[1]);
      return startPct > endPct;
    }
    return false;
  };

  return [...ops].sort((a, b) => {
    if (sortType === 'alphabetical') {
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    }
    
    if (sortType === 'alphabetical-za') {
      return b.nombre.localeCompare(a.nombre, 'es', { sensitivity: 'base' });
    }
    
    if (sortType === 'entry-time') {
      const getEntryTimeMinutes = (op: OperatorData): number => {
        if (hasContinuation(op)) {
          return 0;
        }
        const status = op.asistencia?.[referenceDate];
        if (status === 'Franco' || status === 'Licencia' || status === 'Vacaciones' || !status) {
          return 9999;
        }
        const dailyHorario = (op.horarios_dias && op.horarios_dias[referenceDate]) || op.horario;
        if (!dailyHorario || dailyHorario === '-' || dailyHorario === 'Franco') {
          return 9999;
        }
        const parts = dailyHorario.split(' - ');
        if (parts.length === 2) {
          const start = parts[0];
          const [h, m] = start.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            return h * 60 + m;
          }
        }
        return 9999;
      };
      
      const timeA = getEntryTimeMinutes(a);
      const timeB = getEntryTimeMinutes(b);
      
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    }
    
    if (sortType === 'location') {
      const locA = a.location || 'Monte Grande';
      const locB = b.location || 'Monte Grande';
      if (locA !== locB) {
        return locA.localeCompare(locB, 'es', { sensitivity: 'base' });
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    }
    
    return 0;
  });
}

export async function reloadDataForActiveMonth(targetMonth?: string): Promise<void> {
  try {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const monthToLoad = targetMonth || (dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7));

    const payload = await fetchCronogramaFullData(monthToLoad);
    state.cronoData = payload.operators;
    setOvertimeConfigs(payload.weekendOvertimeConfigs);
    state.availableMonths = payload.availableMonths || [];

    await loadRotationConfig(monthToLoad);

    renderDaily();
    renderMonthly();
    renderMonthDropdown();
    updateMonthDisplay();

    // Actualizar vista de grupos si está visible
    const groupsView = document.getElementById('groups-view');
    const isGroupsVisible = groupsView && !groupsView.classList.contains('hidden');
    if (isGroupsVisible) {
      await renderGroupsView();
    }

    // Actualizar vista de pasivas si está visible
    const pasivaView = document.getElementById('pasiva-view');
    const isPasivaVisible = pasivaView && !pasivaView.classList.contains('hidden');
    if (isPasivaVisible) {
      await renderPasivaView();
    }
  } catch (err) {
    console.error("Error reloading data for month:", err);
    showToast("Error al recargar datos del mes", "error");
  }
}

async function init(): Promise<void> {
  try {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const todayStr = formatYMD(new Date());
    let initialMonth = dateInput?.value ? dateInput.value.slice(0, 7) : todayStr.slice(0, 7);

    const payload = await fetchCronogramaFullData(initialMonth);
    state.cronoData = payload.operators;
    setOvertimeConfigs(payload.weekendOvertimeConfigs);
    state.availableMonths = payload.availableMonths || [];

    try {
      const feriadosRes = await fetch('/api/cronograma/feriados');
      if (feriadosRes.ok) {
        state.feriados = await feriadosRes.json();
      }
    } catch (err) {
      console.warn("Failed to load holidays:", err);
    }

    await loadRotationConfig(initialMonth);

    const hasDataForToday = state.cronoData.some(op => op.asistencia[todayStr]);
    const initialDate = hasDataForToday ? todayStr : (state.uniqueDates[state.uniqueDates.length - 1] || todayStr);

    if (dateInput) {
      dateInput.value = initialDate;
      updateDateInputDisplay();
      updateMonthDisplay();
      if (state.uniqueDates.length > 0) {
        dateInput.min = state.uniqueDates[0];
        dateInput.max = state.uniqueDates[state.uniqueDates.length - 1];
      }
    }

    renderDaily();
    renderMonthly();
    renderMonthDropdown();
    setupEventListeners();
  } catch (err: unknown) {
    console.error("Error loading data:", err);
    showToast("Error al cargar datos del cronograma", "error");
  }
}

function updateOperatorDailyHorario(op: OperatorData, date: string, status: string): void {
  const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const dateObj = new Date(date + "T12:00:00");
  const dayName = dayNames[dateObj.getDay()];

  op.horarios_dias = op.horarios_dias || {};
  op.overrides = op.overrides || {};

  const isWeekendDay = dateObj.getDay() === 0 || dateObj.getDay() === 6;

  if (isWeekendDay) {
    if (status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones) {
      op.weekendOvertimes = (op.weekendOvertimes || []).filter(s => s.date !== date);
      op.overrides[date] = true;
    } else if (status === OperatorStatus.Franco) {
      delete op.overrides[date];
    }
  } else {
    op.overrides[date] = true;
  }

  if (status === "Franco") {
    op.horarios_dias[date] = "";
  } else {
    const current = op.horarios_dias[date];
    if (!current || current === "Franco" || current === "-") {
      if (op.esquema_horario?.[dayName]) {
        op.horarios_dias[date] = op.esquema_horario[dayName];
      } else {
        op.horarios_dias[date] = op.horario || "";
      }
    }
  }
}

function updateCellStatus(cell: HTMLElement, newStatus: string): void {
  const operator = cell.dataset.operator;
  const date = cell.dataset.date;
  if (!operator || !date) return;
  if (isWeekend(date)) {
    if (newStatus !== OperatorStatus.Licencia &&
        newStatus !== OperatorStatus.Vacaciones &&
        newStatus !== OperatorStatus.Franco &&
        newStatus !== OperatorStatus.HomeOffice) {
      return;
    }
  }

  const existingIndex = state.modifiedSchedules.findIndex(e => e.agentName === operator && e.date === date);
  if (existingIndex !== -1) {
    state.modifiedSchedules[existingIndex].status = newStatus;
  } else {
    state.modifiedSchedules.push({ agentName: operator, date, status: newStatus });
  }

  const opIndex = state.cronoData.findIndex(o => o.nombre === operator);
  if (opIndex !== -1) {
    state.cronoData[opIndex].asistencia[date] = newStatus as OperatorStatus;
    updateOperatorDailyHorario(state.cronoData[opIndex], date, newStatus);
    renderMonthly();
  }

  if (state.isEditMode) {
    updatePendingEditsUI();
  }
}

function updatePendingEditsUI(): void {
   const uniqueKeys = new Set<string>();
   Object.keys(state.pendingEdits).forEach(k => uniqueKeys.add(k));
   state.modifiedSchedules.forEach(m => uniqueKeys.add(`${m.agentName}_${m.date}`));
   
   const count = uniqueKeys.size;
   const countEl = document.getElementById('pending-edits-count');
   const saveBtn = document.getElementById('save-edits-btn') as HTMLButtonElement | null;
   const discardBtn = document.getElementById('discard-edits-btn') as HTMLButtonElement | null;
   
   if (countEl) countEl.innerText = `${count} cambios`;
   if (saveBtn) saveBtn.disabled = count === 0;
   if (discardBtn) discardBtn.disabled = count === 0;

   const saveIndicator = document.getElementById('save-indicator');
   if (saveIndicator) {
     if (state.isEditMode) {
       saveIndicator.classList.add('hidden');
     } else {
       if (count > 0) {
         saveIndicator.classList.remove('hidden');
       } else {
         saveIndicator.classList.add('hidden');
       }
     }
   }
}

async function discardChanges(): Promise<void> {
  try {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const currentMonth = dateInput?.value ? dateInput.value.slice(0, 7) : undefined;
    const data = await fetchCronogramaData(currentMonth);
    state.cronoData = data;
    state.modifiedSchedules = [];
    
    const saveIndicator = document.getElementById('save-indicator');
    if (saveIndicator) saveIndicator.classList.add('hidden');

    renderDaily();
    renderMonthly();
  } catch (err: unknown) {
    console.error("Error discarding/reloading data:", err);
    showToast("Error al recargar el cronograma", "error");
  }
}

export function updateViewSwitcherUI(activeView: 'monthly' | 'daily' | 'groups' | 'overtime' | 'pasiva'): void {
  const switchBtns = [
    { id: 'switch-to-monthly-btn', view: 'monthly' },
    { id: 'switch-to-daily-btn', view: 'daily' },
    { id: 'switch-to-groups-btn', view: 'groups' },
    { id: 'switch-to-overtime-btn', view: 'overtime' },
    { id: 'switch-to-pasiva-btn', view: 'pasiva' },
  ];

  const activeClasses = ['btn-secondary', 'shadow-sm', 'shadow-secondary/15'];
  const inactiveClasses = ['btn-outline', 'border-transparent', 'text-base-content/60', 'hover:bg-base-200/50'];

  switchBtns.forEach(({ id, view }) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    if (view === activeView) {
      btn.classList.add(...activeClasses);
      btn.classList.remove(...inactiveClasses);
    } else {
      btn.classList.remove(...activeClasses);
      btn.classList.add(...inactiveClasses);
    }
  });
}

function showDailyView(): void {
  const dailyView = document.getElementById('daily-view');
  const monthlyView = document.getElementById('monthly-view');
  const groupsView = document.getElementById('groups-view');
  const overtimeView = document.getElementById('overtime-view');
  const pasivaView = document.getElementById('pasiva-view');
  const datePickerContainer = document.getElementById('date-picker-container');

  renderDaily();
  updateViewSwitcherUI('daily');

  if (dailyView) dailyView.classList.remove('hidden');
  if (monthlyView) monthlyView.classList.add('hidden');
  if (groupsView) groupsView.classList.add('hidden');
  if (overtimeView) overtimeView.classList.add('hidden');
  if (pasivaView) pasivaView.classList.add('hidden');

  if (datePickerContainer) {
    datePickerContainer.classList.remove('hidden');
    setTimeout(() => {
      datePickerContainer.classList.remove('is-faded');
    }, 50);
  }
}

function showMonthlyView(): void {
  const dailyView = document.getElementById('daily-view');
  const monthlyView = document.getElementById('monthly-view');
  const groupsView = document.getElementById('groups-view');
  const overtimeView = document.getElementById('overtime-view');
  const pasivaView = document.getElementById('pasiva-view');
  const datePickerContainer = document.getElementById('date-picker-container');

  renderMonthly();
  updateViewSwitcherUI('monthly');

  if (dailyView) dailyView.classList.add('hidden');
  if (monthlyView) monthlyView.classList.remove('hidden');
  if (groupsView) groupsView.classList.add('hidden');
  if (overtimeView) overtimeView.classList.add('hidden');
  if (pasivaView) pasivaView.classList.add('hidden');

  if (datePickerContainer) {
    datePickerContainer.classList.remove('hidden');
    setTimeout(() => {
      datePickerContainer.classList.remove('is-faded');
    }, 50);
  }
}

export function showGroupsView(): void {
  const dailyView = document.getElementById('daily-view');
  const monthlyView = document.getElementById('monthly-view');
  const groupsView = document.getElementById('groups-view');
  const overtimeView = document.getElementById('overtime-view');
  const pasivaView = document.getElementById('pasiva-view');
  const datePickerContainer = document.getElementById('date-picker-container');
  
  renderGroupsView();
  updateViewSwitcherUI('groups');
  
  if (dailyView) dailyView.classList.add('hidden');
  if (monthlyView) monthlyView.classList.add('hidden');
  if (groupsView) groupsView.classList.remove('hidden');
  if (overtimeView) overtimeView.classList.add('hidden');
  if (pasivaView) pasivaView.classList.add('hidden');
  
  if (datePickerContainer) {
    datePickerContainer.classList.add('is-faded');
    setTimeout(() => {
      datePickerContainer.classList.add('hidden');
    }, 300);
  }
}

export async function renderGroupsView(): Promise<void> {
  try {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const res = await fetch(`/api/cronograma/rotation-config?month=${month}`);
    if (!res.ok) throw new Error("No se pudo cargar la configuración de rotación");
    const config = await res.json();
    
    const startDateInput = document.getElementById('rotation-start-date') as HTMLInputElement | null;
    const startGroupSelect = document.getElementById('rotation-start-group') as HTMLSelectElement | null;
    const orderInput = document.getElementById('rotation-order') as HTMLInputElement | null;
    
    if (startDateInput && config.startDate) {
      startDateInput.value = config.startDate;
      const displayEl = document.getElementById('rotation-start-date-display');
      if (displayEl) {
        displayEl.innerText = formatToDDMMYY(config.startDate);
      }
    }
    if (startGroupSelect && config.startGroup) startGroupSelect.value = config.startGroup;
    if (orderInput && config.rotationOrder) orderInput.value = config.rotationOrder;

    setActiveRotationConfig({ startDate: config.startDate, startGroup: config.startGroup, rotationOrder: config.rotationOrder });
    ['A', 'B', 'C', 'D'].forEach(group => {
      const dateEl = document.getElementById(`group-${group}-next-date`);
      if (dateEl) {
        const nextDate = getNextSaturdayForGroup(group);
        if (nextDate) {
          dateEl.textContent = formatToDDMMYY(nextDate);
          dateEl.classList.remove('hidden');
        } else {
          dateEl.classList.add('hidden');
        }
      }
    });
    
    const groupContainers: Record<string, HTMLElement | null> = {
      A: document.getElementById('group-A-list'),
      B: document.getElementById('group-B-list'),
      C: document.getElementById('group-C-list'),
      D: document.getElementById('group-D-list'),
    };
    
    const groupCounts: Record<string, HTMLElement | null> = {
      A: document.getElementById('group-A-count'),
      B: document.getElementById('group-B-count'),
      C: document.getElementById('group-C-count'),
      D: document.getElementById('group-D-count'),
    };

    const addMemberSelects: Record<string, HTMLSelectElement | null> = {
      A: document.getElementById('add-member-select-A') as HTMLSelectElement | null,
      B: document.getElementById('add-member-select-B') as HTMLSelectElement | null,
      C: document.getElementById('add-member-select-C') as HTMLSelectElement | null,
      D: document.getElementById('add-member-select-D') as HTMLSelectElement | null,
    };

    const groups = ['A', 'B', 'C', 'D'];
    groups.forEach(g => {
      if (groupContainers[g]) groupContainers[g]!.innerHTML = '';
      if (groupCounts[g]) groupCounts[g]!.innerText = '0 ops';
      if (addMemberSelects[g]) {
        addMemberSelects[g]!.innerHTML = '<option value="" disabled selected>Seleccionar...</option>';
      }
    });

    const unassignedAgents: OperatorData[] = [];
    const groupMembers: Record<string, OperatorData[]> = { A: [], B: [], C: [], D: [] };

    state.cronoData.forEach(agent => {
      const group = agent.saturdayGroup;
      if (group && ['A', 'B', 'C', 'D'].includes(group)) {
        groupMembers[group].push(agent);
      } else {
        unassignedAgents.push(agent);
      }
    });

    groups.forEach(g => {
      const list = groupMembers[g] || [];
      if (groupCounts[g]) {
        groupCounts[g]!.innerText = `${list.length} op${list.length !== 1 ? 's' : ''}`;
      }

      if (groupContainers[g]) {
        if (list.length === 0) {
          groupContainers[g]!.innerHTML = `
            <div class="py-6 text-center text-xs text-base-content/30 font-medium border border-dashed border-base-300 rounded-xl bg-base-100/50">
              Sin operadores
            </div>
          `;
        } else {
          list.sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(agent => {
            const html = `
              <div class="flex items-center justify-between p-2.5 bg-base-100 border border-base-300/80 rounded-xl hover:border-secondary/30 transition-all shadow-sm group">
                <div class="flex flex-col min-w-0">
                  <span class="font-bold text-xs text-base-content truncate">${escapeHtml(agent.nombre)}</span>
                  <span class="text-tiny font-semibold text-base-content/50 truncate">${escapeHtml(agent.saturdayHorario || '07:00 - 13:00')}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button 
                    type="button" 
                    class="btn btn-square btn-ghost btn-xs text-base-content/60 hover:text-secondary hover:bg-secondary/10 edit-member-schedule-btn"
                    data-agent-id="${agent.id}"
                    data-agent-name="${escapeHtml(agent.nombre)}"
                    data-agent-group="${agent.saturdayGroup}"
                    data-agent-horario="${escapeHtml(agent.saturdayHorario || '07:00 - 13:00')}"
                    title="Editar horario"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button 
                    type="button" 
                    class="btn btn-square btn-ghost btn-xs text-base-content/60 hover:text-error hover:bg-error/10 remove-member-btn"
                    data-agent-id="${agent.id}"
                    data-agent-name="${escapeHtml(agent.nombre)}"
                    title="Quitar del grupo"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              </div>
            `;
            groupContainers[g]!.insertAdjacentHTML('beforeend', html);
          });
        }
      }
    });

    groups.forEach(g => {
      const select = addMemberSelects[g];
      if (select) {
        unassignedAgents.sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(agent => {
          const opt = document.createElement('option');
          opt.value = String(agent.id);
          opt.textContent = agent.nombre;
          select.appendChild(opt);
        });
      }
    });

    // --- Initialize Saturday Rotation Timeline ---
    const activeDateStr = dateInput?.value || formatYMD(new Date());
    const activeMonthPrefix = activeDateStr.slice(0, 7);

    if (!rotationTimelineSelectedDate || !rotationTimelineSelectedDate.startsWith(activeMonthPrefix)) {
      const baseDate = new Date(activeDateStr + 'T12:00:00');
      const dayVal = baseDate.getDay();
      const diff = dayVal === 0 ? -1 : 6 - dayVal;
      baseDate.setDate(baseDate.getDate() + diff);
      setRotationTimelineSelectedDate(formatYMD(baseDate));
    }

    const rotationTimelineInput = document.getElementById('rotation-timeline-date') as HTMLInputElement | null;
    if (rotationTimelineInput) {
      rotationTimelineInput.value = rotationTimelineSelectedDate!;
      const displayEl = document.getElementById('rotation-timeline-date-display');
      if (displayEl) {
        displayEl.textContent = formatToDDMMYY(rotationTimelineSelectedDate!);
      }
    }
    renderRotationTimeline(rotationTimelineSelectedDate!);

  } catch (err: any) {
    console.error("renderGroupsView Error:", err);
    showToast("Error al renderizar vista de grupos", "error");
  }
}

function updateFilterActiveStates(): void {
  const filterAllBtn = document.getElementById('filter-all-btn');
  const filterPresencialMgBtn = document.getElementById('filter-presencial-mg-btn');
  const filterPresencialPpBtn = document.getElementById('filter-presencial-pp-btn');
  const filterHoBtn = document.getElementById('filter-ho-btn');
  const filterLicenciaBtn = document.getElementById('filter-licencia-btn');
  const filterVacacionesBtn = document.getElementById('filter-vacaciones-btn');

  const filterAllBtnDaily = document.getElementById('filter-all-btn-daily');
  const filterPresencialMgBtnDaily = document.getElementById('filter-presencial-mg-btn-daily');
  const filterPresencialPpBtnDaily = document.getElementById('filter-presencial-pp-btn-daily');
  const filterHoBtnDaily = document.getElementById('filter-ho-btn-daily');
  const filterLicenciaBtnDaily = document.getElementById('filter-licencia-btn-daily');
  const filterVacacionesBtnDaily = document.getElementById('filter-vacaciones-btn-daily');

  const monthlyButtons = [
    { el: filterAllBtn, value: 'all' },
    { el: filterPresencialMgBtn, value: 'Presencial Monte Grande' },
    { el: filterPresencialPpBtn, value: 'Presencial Parque Patricios' },
    { el: filterHoBtn, value: 'Home Office' },
    { el: filterLicenciaBtn, value: 'Licencia' },
    { el: filterVacacionesBtn, value: 'Vacaciones' }
  ];

  const dailyButtons = [
    { el: filterAllBtnDaily, value: 'all' },
    { el: filterPresencialMgBtnDaily, value: 'Presencial Monte Grande' },
    { el: filterPresencialPpBtnDaily, value: 'Presencial Parque Patricios' },
    { el: filterHoBtnDaily, value: 'Home Office' },
    { el: filterLicenciaBtnDaily, value: 'Licencia' },
    { el: filterVacacionesBtnDaily, value: 'Vacaciones' }
  ];

  updateButtonGroupState(monthlyButtons, state.activeFilter, STATUS_FILTER_CONFIGS.monthly);
  updateButtonGroupState(dailyButtons, state.activeFilter, STATUS_FILTER_CONFIGS.daily);
}

function updateLocationFilterActiveStates(): void {
  const filterLocationAllBtn = document.getElementById('filter-location-all-btn');
  const filterLocationMgBtn = document.getElementById('filter-location-mg-btn');
  const filterLocationPpBtn = document.getElementById('filter-location-pp-btn');

  const filterLocationAllBtnDaily = document.getElementById('filter-location-all-btn-daily');
  const filterLocationMgBtnDaily = document.getElementById('filter-location-mg-btn-daily');
  const filterLocationPpBtnDaily = document.getElementById('filter-location-pp-btn-daily');

  const monthlyButtons = [
    { el: filterLocationAllBtn, value: 'all' },
    { el: filterLocationMgBtn, value: 'Monte Grande' },
    { el: filterLocationPpBtn, value: 'Parque Patricios' }
  ];

  const dailyButtons = [
    { el: filterLocationAllBtnDaily, value: 'all' },
    { el: filterLocationMgBtnDaily, value: 'Monte Grande' },
    { el: filterLocationPpBtnDaily, value: 'Parque Patricios' }
  ];

  updateButtonGroupState(monthlyButtons, state.activeLocationFilter, LOCATION_FILTER_CONFIG);
  updateButtonGroupState(dailyButtons, state.activeLocationFilter, LOCATION_FILTER_CONFIG);
}

function applyBrushToCell(cell: HTMLElement): void {
  const operator = cell.dataset.operator;
  const date = cell.dataset.date;
  if (!operator || !date || !state.activeBrush) return;

  if (isWeekend(date)) {
    if (state.activeBrush !== OperatorStatus.Licencia &&
        state.activeBrush !== OperatorStatus.Vacaciones &&
        state.activeBrush !== OperatorStatus.Franco &&
        state.activeBrush !== OperatorStatus.HomeOffice) {
      return;
    }
  }

  updateCellStatus(cell, state.activeBrush);
}

function updateBrushUI(): void {
  document.querySelectorAll('.brush-btn').forEach(btn => {
    const brush = (btn as HTMLElement).dataset.brush;
    if (state.activeBrush === brush) {
      btn.classList.add('ring-2', 'ring-secondary', 'bg-base-200');
    } else {
      btn.classList.remove('ring-2', 'ring-secondary', 'bg-base-200');
    }
  });
}

function updateMaximizeUI(isMax: boolean): void {
  const htmlEl = document.documentElement;
  if (isMax) {
    htmlEl.classList.add('cronograma-maximized');
  } else {
    htmlEl.classList.remove('cronograma-maximized');
  }
}

function setupEventListeners(): void {
  // Month Dropdown Event Delegation
  const handleDropdownClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-month-val]');
    if (!target) return;
    const val = target.getAttribute('data-month-val');
    if (val) {
      const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
      if (dateInput) {
        dateInput.value = val;
        updateDateInputDisplay();
        reloadDataForActiveMonth(val.slice(0, 7));
      }
    }
    // Force close dropdown by blurring active element
    (document.activeElement as HTMLElement | null)?.blur();
  };

  document.getElementById('month-dropdown-list')?.addEventListener('click', handleDropdownClick);
  document.getElementById('groups-month-dropdown-list')?.addEventListener('click', handleDropdownClick);

  // New Operator Modal Handlers
  const newOpModal = document.getElementById('new-operator-modal') as HTMLDialogElement & { showModal: () => void; close: () => void } | null;
  const openNewOpBtn = document.getElementById('open-new-op-modal');

  openNewOpBtn?.addEventListener('click', () => {
    newOpModal?.showModal();
  });

  // Holidays Modal Trigger
  const holidaysModal = document.getElementById('holidays-modal') as HTMLDialogElement & { showModal: () => void; close: () => void } | null;
  const openHolidaysBtn = document.getElementById('open-holidays-modal');

  openHolidaysBtn?.addEventListener('click', () => {
    if (holidaysModal) {
      holidaysModal.showModal();
      holidaysModal.dispatchEvent(new Event('show'));
    }
  });

  document.getElementById('switch-to-monthly-btn')?.addEventListener('click', () => {
    showMonthlyView();
  });

  document.getElementById('switch-to-daily-btn')?.addEventListener('click', () => {
    showDailyView();
  });

  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      updateDateInputDisplay();
      renderDaily();
      renderMonthly(); 
    });
  }

  const rotationStartDateInput = document.getElementById('rotation-start-date') as HTMLInputElement | null;
  rotationStartDateInput?.addEventListener('change', () => {
    const displayEl = document.getElementById('rotation-start-date-display');
    if (displayEl && rotationStartDateInput.value) {
      displayEl.innerText = formatToDDMMYY(rotationStartDateInput.value);
    }
  });

  const monthlyBody = document.getElementById('monthly-tbody');
  const backToMonthlyBtn = document.getElementById('back-to-monthly-btn');

  backToMonthlyBtn?.addEventListener('click', () => {
    showMonthlyView();
  });

  document.getElementById('prev-month-btn')?.addEventListener('click', () => {
    changeMonth(-1);
  });

  document.getElementById('next-month-btn')?.addEventListener('click', () => {
    changeMonth(1);
  });

  document.getElementById('monthly-tfoot')?.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('#toggle-coverage-btn');
    if (!btn) return;
    state.isCoverageMinimized = !state.isCoverageMinimized;
    renderMonthly();
  });

  document.getElementById('monthly-thead')?.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('#toggle-totals-btn');
    if (!btn) return;
    state.isTotalsCollapsed = !state.isTotalsCollapsed;
    renderMonthly();
  });

  let isDragging = false;
  monthlyBody?.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !state.isEditMode || !state.activeBrush) return;
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-monthly-detail]');
    if (trigger) {
       isDragging = true;
       applyBrushToCell(trigger);
    }
  });

  monthlyBody?.addEventListener('mouseover', (event) => {
    if (!isDragging || !state.isEditMode || !state.activeBrush) return;
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-monthly-detail]');
    if (trigger) applyBrushToCell(trigger);
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
  
  monthlyBody?.addEventListener('click', async (event) => {
    // Click on edit operator button
    const editOpBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('.edit-op-btn');
    if (editOpBtn) {
      event.stopPropagation();
      const originalName = editOpBtn.dataset.editOpName;
      const username = editOpBtn.dataset.editOpUsername;
      const location = editOpBtn.dataset.editOpLocation;
      const schedule = editOpBtn.dataset.editOpSchedule;

      const originalNameInput = document.getElementById('edit-op-original-name') as HTMLInputElement | null;
      const nameInput = document.getElementById('edit-op-name') as HTMLInputElement | null;
      const usernameInput = document.getElementById('edit-op-username') as HTMLInputElement | null;
      const locSelect = document.getElementById('edit-op-location') as HTMLSelectElement | null;

      if (originalNameInput) originalNameInput.value = originalName || '';
      if (nameInput) nameInput.value = originalName || '';
      if (usernameInput) usernameInput.value = username || '';
      if (locSelect) locSelect.value = location || 'Monte Grande';

      const editOpModal = document.getElementById('edit-operator-modal') as HTMLDialogElement & { showModal: () => void } | null;
      editOpModal?.showModal();
      return;
    }

    // Click on delete operator button
    const deleteOpBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('.delete-op-btn');
    if (deleteOpBtn) {
      event.stopPropagation();
      const opName = deleteOpBtn.dataset.deleteOpName;
      if (!opName) return;

      const confirmed = await showConfirm(`¿Estás seguro de que deseas eliminar al operador "${opName}"? Esta acción borrará permanentemente sus datos y asistencias registradas.`);
      if (confirmed) {
        deleteOpBtn.disabled = true;
        try {
          await deleteOperator(opName);
          
          const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
          const currentMonth = dateInput?.value ? dateInput.value.slice(0, 7) : undefined;
          const data = await fetchCronogramaData(currentMonth);
          state.cronoData = data;

          renderMonthly();
          renderDaily();
          showToast(`Operador "${opName}" eliminado con éxito.`, "success");
        } catch (err: unknown) {
          console.error("Error deleting operator:", err);
          const msg = err instanceof Error ? err.message : "Error al intentar eliminar operador.";
          showToast(msg, "error");
          deleteOpBtn.disabled = false;
        }
      }
      return;
    }

    // Row bulk edit
    const rowHeader = (event.target as HTMLElement).closest<HTMLElement>('.op-row-header');
    if (rowHeader && state.isEditMode && state.activeBrush) {
       const tr = rowHeader.closest('tr');
       tr?.querySelectorAll('[data-monthly-detail]').forEach(cell => applyBrushToCell(cell as HTMLElement));
       return;
    }

    // Row highlight toggle (when not active brush editing)
    const rowDot = (event.target as HTMLElement).closest<HTMLElement>('.op-row-dot');
    if (rowDot && !(state.isEditMode && state.activeBrush)) {
      const tr = rowDot.closest('tr');
      tr?.classList.toggle('highlighted-row');
      return;
    }
    
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-monthly-detail]');
    if (!trigger) return;

    if (trigger.dataset.saturdayRotation === "true") {
      showGroupsView();
      return;
    }

    if (state.isEditMode && state.activeBrush) return;
    
    document.dispatchEvent(new CustomEvent('cronograma:open-monthly-detail', {
      detail: { trigger }
    }));
  });

  const monthlySearch = document.getElementById('monthly-search') as HTMLInputElement | null;
  const dailySearch = document.getElementById('daily-search') as HTMLInputElement | null;

  const handleSearchInput = debounce((e: Event) => {
    state.searchQuery = (e.target as HTMLInputElement).value.trim();
    if (monthlySearch && monthlySearch !== e.target) monthlySearch.value = state.searchQuery;
    if (dailySearch && dailySearch !== e.target) dailySearch.value = state.searchQuery;
    renderMonthly();
    renderDaily();
  }, 150);

  monthlySearch?.addEventListener('input', handleSearchInput);
  dailySearch?.addEventListener('input', handleSearchInput);

  const syncSortDropdowns = (val: string) => {
    const mLabel = document.getElementById('monthly-sort-label');
    const dLabel = document.getElementById('daily-sort-label');
    const opt = document.querySelector(`.sort-option[data-value="${val}"]`);
    if (opt) {
      const txt = opt.querySelector('span')?.textContent?.trim() || opt.textContent?.trim() || '';
      if (mLabel) mLabel.textContent = `Ordenar: ${txt}`;
      if (dLabel) dLabel.textContent = `Ordenar: ${txt}`;
    }
  };

  syncSortDropdowns(state.activeSort);

  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.getAttribute('data-value') || 'alphabetical';
      state.activeSort = val;
      syncSortDropdowns(val);
      (document.activeElement as HTMLElement)?.blur();
      renderMonthly();
      renderDaily();
    });
  });

  // Wire up filter buttons
  const filterAllBtn = document.getElementById('filter-all-btn');
  const filterPresencialMgBtn = document.getElementById('filter-presencial-mg-btn');
  const filterPresencialPpBtn = document.getElementById('filter-presencial-pp-btn');
  const filterHoBtn = document.getElementById('filter-ho-btn');
  const filterLicenciaBtn = document.getElementById('filter-licencia-btn');
  const filterVacacionesBtn = document.getElementById('filter-vacaciones-btn');

  const filterAllBtnDaily = document.getElementById('filter-all-btn-daily');
  const filterPresencialMgBtnDaily = document.getElementById('filter-presencial-mg-btn-daily');
  const filterPresencialPpBtnDaily = document.getElementById('filter-presencial-pp-btn-daily');
  const filterHoBtnDaily = document.getElementById('filter-ho-btn-daily');
  const filterLicenciaBtnDaily = document.getElementById('filter-licencia-btn-daily');
  const filterVacacionesBtnDaily = document.getElementById('filter-vacaciones-btn-daily');

  const filterBtns = [
    { btn: filterAllBtn, value: 'all' },
    { btn: filterPresencialMgBtn, value: 'Presencial Monte Grande' },
    { btn: filterPresencialPpBtn, value: 'Presencial Parque Patricios' },
    { btn: filterHoBtn, value: 'Home Office' },
    { btn: filterLicenciaBtn, value: 'Licencia' },
    { btn: filterVacacionesBtn, value: 'Vacaciones' },
    { btn: filterAllBtnDaily, value: 'all' },
    { btn: filterPresencialMgBtnDaily, value: 'Presencial Monte Grande' },
    { btn: filterPresencialPpBtnDaily, value: 'Presencial Parque Patricios' },
    { btn: filterHoBtnDaily, value: 'Home Office' },
    { btn: filterLicenciaBtnDaily, value: 'Licencia' },
    { btn: filterVacacionesBtnDaily, value: 'Vacaciones' }
  ];

  filterBtns.forEach(item => {
    item.btn?.addEventListener('click', () => {
      state.activeFilter = item.value;
      updateFilterActiveStates();
      renderMonthly();
      renderDaily();
    });
  });

  const filterLocationAllBtn = document.getElementById('filter-location-all-btn');
  const filterLocationMgBtn = document.getElementById('filter-location-mg-btn');
  const filterLocationPpBtn = document.getElementById('filter-location-pp-btn');

  const filterLocationAllBtnDaily = document.getElementById('filter-location-all-btn-daily');
  const filterLocationMgBtnDaily = document.getElementById('filter-location-mg-btn-daily');
  const filterLocationPpBtnDaily = document.getElementById('filter-location-pp-btn-daily');

  const locationFilterBtns = [
    { btn: filterLocationAllBtn, value: 'all' },
    { btn: filterLocationMgBtn, value: 'Monte Grande' },
    { btn: filterLocationPpBtn, value: 'Parque Patricios' },
    { btn: filterLocationAllBtnDaily, value: 'all' },
    { btn: filterLocationMgBtnDaily, value: 'Monte Grande' },
    { btn: filterLocationPpBtnDaily, value: 'Parque Patricios' }
  ];

  locationFilterBtns.forEach(item => {
    item.btn?.addEventListener('click', () => {
      state.activeLocationFilter = item.value;
      updateLocationFilterActiveStates();
      renderMonthly();
      renderDaily();
    });
  });

  // Initialize filter button states
  updateFilterActiveStates();
  updateLocationFilterActiveStates();

  const quickEditMenu = document.getElementById('quick-edit-menu');
  const saveIndicator = document.getElementById('save-indicator');
  let activeCell: HTMLElement | null = null;

  monthlyBody?.addEventListener('contextmenu', (e) => {
    const container = document.getElementById('cronograma-app-container');
    const userRole = container?.dataset.userRole || 'agent';
    const isReadOnly = ['agent', 'referent'].includes(userRole);
    if (isReadOnly) return;

    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-monthly-detail]');
    if (!trigger || !quickEditMenu) return;
    
    const dateVal = trigger.dataset.date;
    if (dateVal && isWeekend(dateVal)) {
      if (!state.isEditMode) {
        e.preventDefault();
        showToast("Los fines de semana se deben administrar desde las secciones de Grupos o Extras (active el Modo Editar para marcar Licencia/Vacación/Franco)", "warning");
        return;
      }
    }
    
    e.preventDefault();
    activeCell = trigger;
    
    const targetName = document.getElementById('quick-edit-target-name');
    if (targetName) targetName.innerText = trigger.dataset.operator || 'Operador';
    
    quickEditMenu.classList.remove('hidden');

    const isWk = dateVal && isWeekend(dateVal);
    const optionsContainer = document.getElementById('quick-edit-options');
    if (optionsContainer) {
      const options = optionsContainer.querySelectorAll('[data-status]');
      options.forEach(opt => {
        const btn = opt as HTMLButtonElement;
        const status = btn.dataset.status;
        if (isWk) {
          if (status === 'Licencia' || status === 'Vacaciones' || status === 'Franco' || status === OperatorStatus.HomeOffice) {
            btn.classList.remove('hidden');
          } else {
            btn.classList.add('hidden');
          }
        } else {
          btn.classList.remove('hidden');
        }
      });
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = quickEditMenu.offsetWidth || 160;
    const menuHeight = quickEditMenu.offsetHeight || 240;
    const padding = 12;
    
    let left = 0;
    let top = 0;
    
    if (window.innerWidth > 768) {
      // Centered horizontally relative to the cell, clamped within viewport bounds
      left = rect.left + rect.width / 2 - menuWidth / 2;
      left = Math.max(padding, Math.min(window.innerWidth - menuWidth - padding, left));
      
      // Placed above or below the cell based on available space
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < (menuHeight + padding);
      
      if (showAbove) {
        top = rect.top - menuHeight - 8;
        quickEditMenu.style.transformOrigin = 'bottom center';
      } else {
        top = rect.bottom + 8;
        quickEditMenu.style.transformOrigin = 'top center';
      }
      top = Math.max(padding, Math.min(window.innerHeight - menuHeight - padding, top));
    } else {
      // Mobile view: display centered as a modal-like popup
      left = (window.innerWidth - menuWidth) / 2;
      top = (window.innerHeight - menuHeight) / 2;
      quickEditMenu.style.transformOrigin = 'center center';
    }
    
    quickEditMenu.style.left = `${left}px`;
    quickEditMenu.style.top = `${top}px`;
  });

  document.getElementById('quick-edit-options')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn || !activeCell || !quickEditMenu) return;
    
    const newStatus = btn.dataset.status;
    if (newStatus) {
      updateCellStatus(activeCell, newStatus);
      if (!state.isEditMode) {
         saveIndicator?.classList.remove('hidden');
      }
      quickEditMenu.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (quickEditMenu && !quickEditMenu.contains(e.target as Node)) {
      quickEditMenu.classList.add('hidden');
    }
  });

  document.getElementById('reactivate-edit-mode-btn')?.addEventListener('click', () => {
    const toggleEditBtn = document.getElementById('toggle-edit-mode-btn');
    if (toggleEditBtn) {
      toggleEditBtn.click();
    }
  });

  // Delete active Month Listener
  document.getElementById('delete-month-btn')?.addEventListener('click', async () => {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    if (!dateInput || !dateInput.value) return;

    const [yearStr, monthStr] = dateInput.value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed month

    const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
    const monthName = formatter.format(new Date(year, month, 15)).toUpperCase();

    const confirmed = await showConfirm(`¿Estás seguro de que deseas eliminar el mes de ${monthName}? Esta acción borrará permanentemente todos los registros de asistencia y comentarios para este periodo y no se puede deshacer.`);
    if (!confirmed) return;

    const deleteBtn = document.getElementById('delete-month-btn') as HTMLButtonElement | null;
    const originalText = deleteBtn ? deleteBtn.innerHTML : '';
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = `<span class="loading loading-spinner loading-xs"></span> Borrando...`;
    }

    try {
      await deleteMonth(year, month);

      const payload = await fetchCronogramaFullData();
      state.cronoData = payload.operators;
      state.availableMonths = payload.availableMonths || [];

      if (state.uniqueDates.length > 0) {
        const targetDate = state.uniqueDates[state.uniqueDates.length - 1];
        dateInput.value = targetDate;
        dateInput.min = state.uniqueDates[0];
        dateInput.max = targetDate;
      } else {
        const todayStr = formatYMD(new Date());
        dateInput.value = todayStr;
        dateInput.removeAttribute('min');
        dateInput.removeAttribute('max');
      }

      const activeYM = dateInput.value.slice(0, 7);
      await loadRotationConfig(activeYM);

      updateDateInputDisplay();
      updateMonthDisplay();
      renderMonthDropdown();
      renderDaily();
      renderMonthly();
      showToast(`El mes de ${monthName} ha sido eliminado correctamente.`, "success");
    } catch (err: unknown) {
      console.error("Error deleting month:", err);
      showToast("Ocurrió un error al intentar eliminar el mes.", "error");
    } finally {
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalText;
      }
    }
  });

  const newMonthModal = document.getElementById('new-month-modal') as HTMLDialogElement & { showModal: () => void } | null;
  document.getElementById('add-month-btn')?.addEventListener('click', () => {
    newMonthModal?.showModal();
  });

  // --- Import Handler ---
  function handleImportCSV(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    target.value = ''; // Reset selection

    const formData = new FormData();
    formData.append('file', file);

    const btn = document.getElementById('import-csv-btn');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span> Procesando...`;
      (btn as HTMLButtonElement).disabled = true;
    }

    fetch('/api/cronograma/import', {
      method: 'POST',
      body: formData
    })
    .then(res => {
      if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Error en importación'); });
      return res.json();
    })
    .then(data => {
      if (data.edits && Array.isArray(data.edits)) {
        const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
        const currentMonth = dateInput?.value ? dateInput.value.slice(0, 7) : ''; // "YYYY-MM"

        // Filter edits that belong to the active month
        const currentMonthEdits = data.edits.filter((edit: any) => edit.date && edit.date.startsWith(currentMonth));

        if (data.edits.length > 0 && currentMonthEdits.length === 0) {
          showToast("El archivo CSV no corresponde al mes seleccionado. Cambie de mes en el selector antes de importar.", "warning");
          return;
        }

        let appliedCount = 0;
        currentMonthEdits.forEach((edit: any) => {
          const op = state.cronoData.find(o => o.nombre === edit.agentName);
          if (op) {
            const key = `${edit.agentName}_${edit.date}`;
            const originalStatus = op.asistencia?.[edit.date] || 'Franco';
            
            if (edit.status !== originalStatus) {
              state.pendingEdits[key] = {
                agentName: edit.agentName,
                date: edit.date,
                status: edit.status,
                originalStatus,
                horario: edit.horario,
                breakInicio: edit.breakInicio,
                breakFin: edit.breakFin
              };
              
              op.asistencia[edit.date] = edit.status;
              if (edit.horario) {
                if (!op.horarios_dias) op.horarios_dias = {};
                op.horarios_dias[edit.date] = edit.horario;
              }
              if (edit.breakInicio !== undefined) {
                if (!op.breaks_inicio) op.breaks_inicio = {};
                op.breaks_inicio[edit.date] = edit.breakInicio;
              }
              if (edit.breakFin !== undefined) {
                if (!op.breaks_fin) op.breaks_fin = {};
                op.breaks_fin[edit.date] = edit.breakFin;
              }
              appliedCount++;
            }
          }
        });

        if (appliedCount > 0) {
          updatePendingEditsUI();
          renderMonthly();
          showToast(`¡Se cargaron ${appliedCount} cambios desde el CSV! Revise y guarde.`, "success");
        } else {
          showToast("El archivo CSV no contiene cambios con respecto al cronograma actual.", "info");
        }
      }
    })
    .catch(err => {
      console.error(err);
      showToast(err.message || "Error al importar CSV", "error");
    })
    .finally(() => {
      if (btn) {
        btn.innerHTML = originalContent;
        (btn as HTMLButtonElement).disabled = false;
      }
    });
  }

  // --- Premium Exporters ---
  function handleExportCSV() {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    let monthName = 'reporte';
    if (dateInput && dateInput.value) {
      const d = new Date(dateInput.value + 'T12:00:00');
      monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(d);
    }
    const dates = getDatesArrayForCurrentMonth();
    exportCSV(state.cronoData, dates, {
      minCoveragePercent: state.minCoveragePercent,
      maxConsecutiveHOLimit: state.maxConsecutiveHOLimit,
      minPWeekLimit: state.minPWeekLimit,
      maxLicenseOverlapLimit: state.maxLicenseOverlapLimit
    }, monthName);
  }

  async function handleExportAsImage() {
    const tableContainer = document.querySelector('#monthly-table')?.parentElement as HTMLElement | null;
    if (!tableContainer) return;

    const imgBtn = document.getElementById('export-image-btn') as HTMLButtonElement | null;
    const originalText = imgBtn ? imgBtn.innerHTML : '';

    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    let monthName = 'reporte';
    if (dateInput && dateInput.value) {
      const d = new Date(dateInput.value + 'T12:00:00');
      monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(d);
    }

    try {
      await exportAsImage(
        tableContainer,
        monthName,
        () => {
          if (imgBtn) {
            imgBtn.disabled = true;
            imgBtn.innerHTML = `<span class="loading loading-spinner loading-xs mr-1"></span> Procesando...`;
          }
        },
        () => {
          if (imgBtn) {
            imgBtn.disabled = false;
            imgBtn.innerHTML = originalText;
          }
        }
      );
      showToast("Imagen exportada con éxito", "success");
    } catch (err: unknown) {
      console.error(err);
      showToast("Hubo un error al generar la imagen. Intenta imprimir el reporte.", "error");
    }
  }

  document.getElementById('export-csv-btn')?.addEventListener('click', handleExportCSV);
  document.getElementById('export-image-btn')?.addEventListener('click', handleExportAsImage);

  async function handleCopyRotationImage() {
    const copyBtn = document.getElementById('copy-rotation-image-btn') as HTMLButtonElement | null;
    const saturdayCard = document.getElementById('saturday-rotation-card');
    if (!copyBtn || !saturdayCard) return;

    const originalBtnText = copyBtn.innerHTML;
    try {
      copyBtn.disabled = true;
      copyBtn.innerHTML = `
        <span class="loading loading-spinner loading-xs"></span>
        <span>Copiando...</span>
      `;

      saturdayCard.classList.add('exporting-image');

      await exportAsClipboardImage(saturdayCard);

      copyBtn.classList.remove('btn-secondary');
      copyBtn.classList.add('btn-success');
      copyBtn.innerHTML = `
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>¡Copiado!</span>
      `;
      showToast('Tabla de guardia copiada al portapapeles.', 'success');

      setTimeout(() => {
        copyBtn.classList.remove('btn-success');
        copyBtn.classList.add('btn-secondary');
        copyBtn.disabled = false;
        copyBtn.innerHTML = originalBtnText;
      }, 2500);

    } catch (error) {
      console.error('Failed to copy table image:', error);
      showToast('Error al copiar la imagen.', 'error');
      copyBtn.disabled = false;
      copyBtn.innerHTML = originalBtnText;
    } finally {
      saturdayCard.classList.remove('exporting-image');
    }
  }

  document.getElementById('copy-rotation-image-btn')?.addEventListener('click', handleCopyRotationImage);

  async function handleCopyOvertimeImage() {
    const copyBtn = document.getElementById('copy-overtime-image-btn') as HTMLButtonElement | null;
    const overtimeCard = document.getElementById('overtime-card');
    if (!copyBtn || !overtimeCard) return;

    const originalBtnText = copyBtn.innerHTML;
    try {
      copyBtn.disabled = true;
      copyBtn.innerHTML = `
        <span class="loading loading-spinner loading-xs"></span>
        <span>Copiando...</span>
      `;

      overtimeCard.classList.add('exporting-image');

      await exportAsClipboardImage(overtimeCard);

      copyBtn.classList.remove('btn-outline');
      copyBtn.classList.remove('btn-warning');
      copyBtn.classList.add('btn-success');
      copyBtn.innerHTML = `
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>¡Copiado!</span>
      `;
      showToast('Horas extras copiadas al portapapeles.', 'success');

      setTimeout(() => {
        copyBtn.classList.remove('btn-success');
        copyBtn.classList.add('btn-outline');
        copyBtn.classList.add('btn-warning');
        copyBtn.disabled = false;
        copyBtn.innerHTML = originalBtnText;
      }, 2500);

    } catch (error) {
      console.error('Failed to copy overtime image:', error);
      showToast('Error al copiar la imagen.', 'error');
      copyBtn.disabled = false;
      copyBtn.innerHTML = originalBtnText;
    } finally {
      overtimeCard.classList.remove('exporting-image');
    }
  }

  document.getElementById('copy-overtime-image-btn')?.addEventListener('click', handleCopyOvertimeImage);

  const importBtn = document.getElementById('import-csv-btn');
  const importInput = document.getElementById('import-csv-input') as HTMLInputElement | null;
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleImportCSV);
  }

  document.addEventListener('click', (e) => {
    const clickDayBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-click-day]');
    if (clickDayBtn) {
      if (state.isEditMode && state.activeBrush) {
         const dateVal = clickDayBtn.dataset.clickDay;
         document.getElementById('monthly-tbody')?.querySelectorAll(`[data-date="${dateVal}"]`).forEach(cell => applyBrushToCell(cell as HTMLElement));
         return;
      }
      const dateVal = clickDayBtn.dataset.clickDay;
      if (dateVal) {
        const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
        if (dateInput) {
          dateInput.value = dateVal;
          updateDateInputDisplay();
        }
        showDailyView();
      }
      return;
    }
    
    const closeHourlyBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-close-hourly]');
    if (closeHourlyBtn) {
      state.focusedDateStr = null;
      renderMonthly();
      return;
    }

    const profileBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-op-profile]');
    if (profileBtn) {
      const operatorName = profileBtn.dataset.opProfile;
      if (operatorName) {
        document.dispatchEvent(new CustomEvent('cronograma:open-drawer', {
          detail: { operatorName }
        }));
      }
    }
  });

  // --- Edit Mode & Brush Tool ---
  const toggleEditBtn = document.getElementById('toggle-edit-mode-btn');
  const editToolbar = document.getElementById('edit-mode-toolbar');
  
  toggleEditBtn?.addEventListener('click', () => {
    state.isEditMode = !state.isEditMode;
    
    if (state.isEditMode) {
      const saveIndicator = document.getElementById('save-indicator');
      if (saveIndicator) saveIndicator.classList.add('hidden');
      toggleEditBtn.classList.add('bg-secondary', 'text-secondary-content');
      toggleEditBtn.classList.remove('btn-outline');
      document.getElementById('monthly-tbody')?.classList.add('select-none');
      if (editToolbar) {
         editToolbar.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-32');
      }
      updatePendingEditsUI();
    } else {
      toggleEditBtn.classList.remove('bg-secondary', 'text-secondary-content');
      toggleEditBtn.classList.add('btn-outline');
      document.getElementById('monthly-tbody')?.classList.remove('select-none');
      if (editToolbar) {
         editToolbar.classList.add('opacity-0', 'pointer-events-none', 'translate-y-32');
      }
      state.activeBrush = null;
      updateBrushUI();
      
      const hasUnsavedChanges = state.modifiedSchedules.length > 0 || Object.keys(state.pendingEdits).length > 0;
      if (hasUnsavedChanges) {
         const saveIndicator = document.getElementById('save-indicator');
         if (saveIndicator) saveIndicator.classList.remove('hidden');
      }
    }
    renderMonthly();
  });

  document.querySelectorAll('.brush-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const brush = (e.currentTarget as HTMLElement).dataset.brush;
      if (state.activeBrush === brush) state.activeBrush = null;
      else state.activeBrush = brush || null;
      updateBrushUI();
    });
  });

  document.getElementById('discard-edits-btn')?.addEventListener('click', async () => {
      state.pendingEdits = {};
      updatePendingEditsUI();
      await discardChanges();
   });

   document.getElementById('save-edits-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      
      const mergedEditsMap = new Map<string, { agentName: string; date: string; status: string }>();
      
      state.modifiedSchedules.forEach(m => {
         mergedEditsMap.set(`${m.agentName}_${m.date}`, { agentName: m.agentName, date: m.date, status: m.status });
      });
      
      Object.values(state.pendingEdits).forEach(p => {
         mergedEditsMap.set(`${p.agentName}_${p.date}`, { agentName: p.agentName, date: p.date, status: p.status });
      });
      
      const editsToSave = Array.from(mergedEditsMap.values());
      
      if (editsToSave.length === 0) return;
      
      btn.disabled = true;
      btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span>`;
      
      try {
        await saveEdits(editsToSave);
        
        state.pendingEdits = {};
        state.modifiedSchedules = [];
        updatePendingEditsUI();
        
        const saveIndicator = document.getElementById('save-indicator');
        if (saveIndicator) saveIndicator.classList.add('hidden');
        
        btn.innerText = "Guardado!";
        setTimeout(() => { btn.innerText = "Guardar"; }, 2000);
        showToast("Cambios guardados con éxito", "success");
      } catch (err: unknown) {
        console.error(err);
        btn.innerText = "Error";
        btn.classList.add('btn-error');
        setTimeout(() => { 
           btn.innerText = "Guardar"; 
           btn.classList.remove('btn-error');
           btn.disabled = false;
        }, 2000);
        showToast("Error al guardar los cambios", "error");
      }
   });

  // Make the entire date input wrapper clickable
  const startDateWrapper = document.getElementById('rotation-start-date-wrapper');
  const startDateInput = document.getElementById('rotation-start-date') as HTMLInputElement | null;
  if (startDateWrapper && startDateInput) {
    startDateWrapper.addEventListener('click', () => {
      startDateInput.showPicker();
    });
    startDateInput.addEventListener('input', () => {
      const displayEl = document.getElementById('rotation-start-date-display');
      if (displayEl && startDateInput.value) {
        displayEl.innerText = formatToDDMMYY(startDateInput.value);
      }
    });
  }

  // --- Groups View Event Listeners ---
  document.getElementById('switch-to-groups-btn')?.addEventListener('click', () => {
    showGroupsView();
  });

  const rotForm = document.getElementById('rotation-config-form') as HTMLFormElement | null;
  rotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const startDate = (document.getElementById('rotation-start-date') as HTMLInputElement).value;
    const startGroup = (document.getElementById('rotation-start-group') as HTMLSelectElement).value;
    const rotationOrder = (document.getElementById('rotation-order') as HTMLInputElement).value;

    const dateObj = new Date(startDate + "T12:00:00");
    if (dateObj.getDay() !== 6) {
      showToast("La fecha de inicio debe ser un sábado", "error");
      return;
    }

    const saveBtn = rotForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="loading loading-spinner loading-xs mr-1"></span> Guardando...';
    }

    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

    try {
      const res = await fetch('/api/cronograma/rotation-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, startDate, startGroup, rotationOrder })
      });
      if (!res.ok) throw new Error("Error al guardar la configuración");
      setActiveRotationConfig({ startDate, startGroup, rotationOrder });
      
      await reloadDataForActiveMonth(month);
      renderGroupsView();
      showToast("Configuración de rotación guardada con éxito", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Error al guardar la configuración de rotación", "error");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
      }
    }
  });

  ['A', 'B', 'C', 'D'].forEach(g => {
    const select = document.getElementById(`add-member-select-${g}`) as HTMLSelectElement | null;
    select?.addEventListener('change', async () => {
      const agentIdStr = select.value;
      if (!agentIdStr) return;
      select.disabled = true;

      const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
      const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

      try {
        const res = await fetch('/api/cronograma/rotation-groups/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: parseInt(agentIdStr, 10), saturdayGroup: g, month })
        });
        if (!res.ok) throw new Error("Error al asignar el operador al grupo");
        
        await reloadDataForActiveMonth(month);
        renderGroupsView();
        showToast("Operador asignado al grupo con éxito", "success");
      } catch (err: any) {
        console.error(err);
        showToast("Error al asignar operador al grupo", "error");
      } finally {
        select.disabled = false;
        select.value = "";
      }
    });
  });

  const groupsViewElement = document.getElementById('groups-view');
  const editSatModal = document.getElementById('edit-saturday-schedule-modal') as HTMLDialogElement & { showModal: () => void; close: () => void } | null;
  const editSatForm = document.getElementById('edit-saturday-schedule-form') as HTMLFormElement | null;
  
  groupsViewElement?.addEventListener('click', async (e) => {
    const removeBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.remove-member-btn');
    if (removeBtn) {
      const agentIdStr = removeBtn.dataset.agentId;
      const agentName = removeBtn.dataset.agentName || 'el operador';
      if (!agentIdStr) return;

      const confirmed = await showConfirm(`¿Estás seguro de que deseas quitar a ${agentName} de su grupo de rotación?`);
      if (confirmed) {
        removeBtn.disabled = true;

        const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
        const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

        try {
          const res = await fetch('/api/cronograma/rotation-groups/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: parseInt(agentIdStr, 10), saturdayGroup: null, month })
          });
          if (!res.ok) throw new Error("Error al desasignar operador");
          
          await reloadDataForActiveMonth(month);
          renderGroupsView();
          showToast("Operador quitado del grupo con éxito", "success");
        } catch (err: any) {
          console.error(err);
          showToast("Error al quitar al operador del grupo", "error");
          removeBtn.disabled = false;
        }
      }
      return;
    }

    const editBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.edit-member-schedule-btn');
    if (editBtn) {
      const agentIdStr = editBtn.dataset.agentId;
      const agentName = editBtn.dataset.agentName || '';
      const agentGroup = editBtn.dataset.agentGroup || '';
      const agentHorario = editBtn.dataset.agentHorario || '07:00 - 13:00';
      if (!agentIdStr) return;

      const opIdInput = document.getElementById('modal-agent-id') as HTMLInputElement | null;
      const opNameDisplay = document.getElementById('modal-agent-name') as HTMLElement | null;
      const opGroupInput = document.getElementById('modal-agent-group') as HTMLInputElement | null;
      const startInput = document.getElementById('modal-schedule-start') as HTMLInputElement | null;
      const endInput = document.getElementById('modal-schedule-end') as HTMLInputElement | null;

      let start = "07:00";
      let end = "13:00";
      if (agentHorario && agentHorario.includes(" - ")) {
        const parts = agentHorario.split(" - ");
        if (parts.length === 2) {
          start = parts[0];
          end = parts[1];
        }
      }

      if (opIdInput) opIdInput.value = agentIdStr;
      if (opNameDisplay) opNameDisplay.innerText = agentName;
      if (opGroupInput) opGroupInput.value = agentGroup;
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = end;

      editSatModal?.showModal();
      return;
    }
  });

  editSatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const agentIdStr = (document.getElementById('modal-agent-id') as HTMLInputElement).value;
    const saturdayGroup = (document.getElementById('modal-agent-group') as HTMLInputElement).value;
    const start = (document.getElementById('modal-schedule-start') as HTMLInputElement).value;
    const end = (document.getElementById('modal-schedule-end') as HTMLInputElement).value;

    if (!start || !end) {
      showToast("Debe ingresar la hora de inicio y de fin", "error");
      return;
    }

    if (start < '07:00' || end > '13:00') {
      showToast("Los horarios deben estar dentro del rango 07:00 a 13:00 hs", "error");
      return;
    }

    if (start >= end) {
      showToast("La hora de inicio debe ser anterior a la hora de fin", "error");
      return;
    }

    const saveBtn = editSatForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="loading loading-spinner loading-xs mr-1"></span> Guardando...';
    }

    const saturdayHorario = `${start} - ${end}`;
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

    try {
      const res = await fetch('/api/cronograma/rotation-groups/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: parseInt(agentIdStr, 10), saturdayGroup, saturdayHorario, month })
      });
      if (!res.ok) throw new Error("Error al actualizar la configuración del operador");
      
      await reloadDataForActiveMonth(month);
      renderGroupsView();
      editSatModal?.close();
      showToast("Configuración de operador guardada con éxito", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Error al guardar la configuración del operador", "error");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
      }
    }
  });

  // Call submodule event listeners setup
  setupRotationEventListeners();
  setupOvertimeEventListeners();
  setupPasivaEventListeners();
}

// --- Global Event Listeners ---
document.addEventListener('cronograma:data-changed', async () => {
  try {
    await reloadDataForActiveMonth();
  } catch (err: unknown) {
    console.error("Error refreshing data:", err);
    showToast("Error al actualizar datos", "error");
  }
});

document.addEventListener('cronograma:month-created', async (e: any) => {
  const { year, month } = e.detail;
  const targetMonth = `${year}-${(month + 1).toString().padStart(2, '0')}`;
  
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  if (dateInput) {
    dateInput.value = `${targetMonth}-01`;
    updateDateInputDisplay();
  }

  try {
    await reloadDataForActiveMonth(targetMonth);
    showToast("Nuevo mes agregado con éxito", "success");
  } catch (err: unknown) {
    console.error("Error refreshing data after month creation:", err);
  }
});

document.addEventListener('cronograma:rules-changed', () => {
  renderMonthly();
  renderDaily();
  showToast("Reglas de control actualizadas", "success");
});

document.addEventListener('cronograma:feriados-updated', () => {
  renderMonthly();
  renderDaily();
});

// Hover effect to highlight break in Gantt timeline
document.addEventListener('mouseover', (e) => {
  const badge = (e.target as HTMLElement).closest<HTMLElement>('.daily-break-badge');
  if (badge) {
    const tr = badge.closest('tr');
    const breakBar = tr?.querySelector('.gantt-bar-break');
    breakBar?.classList.add('gantt-break-highlighted');
  }
});

document.addEventListener('mouseout', (e) => {
  const badge = (e.target as HTMLElement).closest<HTMLElement>('.daily-break-badge');
  if (badge) {
    const tr = badge.closest('tr');
    const breakBar = tr?.querySelector('.gantt-bar-break');
    breakBar?.classList.remove('gantt-break-highlighted');
  }
});

// Force maximized layout unconditionally
updateMaximizeUI(true);

init();
