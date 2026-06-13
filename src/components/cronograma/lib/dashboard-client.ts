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
import { exportCSV, exportAsImage } from './exporters';
import { showToast, showConfirm } from './notifications';
import { OperatorStatus, type OperatorData, type WeekendOvertimeShift, type WeekendOvertimeConfig } from './types';
import { isFeriado, getFeriadoName } from './feriados';

let activeRotationConfig: { startDate: string; startGroup: string; rotationOrder: string } | null = null;

// --- Overtime state ---
let overtimeConfigs: WeekendOvertimeConfig[] = [];
let overtimeSelectedWeekend: string | null = null; // "YYYY-MM-DD" Saturday

// --- Rotation Timeline state ---
let rotationTimelineSelectedDate: string | null = null; // "YYYY-MM-DD" Saturday

function formatToDDMMYY(dateStr: string): string {
  if (!dateStr) return "dd/mm/yy";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return "dd/mm/yy";
  const [year, month, day] = parts;
  return `${day}/${month}/${year.slice(-2)}`;
}

function isHourCoveredBySchedule(scheduleStr: string, hourStart: number): boolean {
  if (!scheduleStr || scheduleStr === '-') return false;
  const parts = scheduleStr.split('-');
  if (parts.length !== 2) return false;
  const startMin = timeToMinutes(parts[0].trim());
  const endMin = timeToMinutes(parts[1].trim());
  
  const slotStartMin = hourStart * 60;
  const slotEndMin = (hourStart + 1) * 60;
  
  return startMin <= slotStartMin && endMin >= slotEndMin;
}

function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const dateObj = new Date(dateStr + "T12:00:00");
  const day = dateObj.getDay();
  return day === 6 || day === 0;
}

function resolveOperatorStatusAndHorario(op: OperatorData, dateStr: string): { status: OperatorStatus; horario: string } {
  let status = op.asistencia[dateStr] || OperatorStatus.Franco;
  let horario = (op.horarios_dias && op.horarios_dias[dateStr]) || op.horario || "";

  const dateObj = new Date(dateStr + "T12:00:00");
  const isWeekendDay = dateObj.getDay() === 0 || dateObj.getDay() === 6;

  if (isWeekendDay) {
    const isSaturday = dateObj.getDay() === 6;
    if (isSaturday && op.saturdayGroup) {
      const activeGroup = getActiveGroupForDate(dateStr);
      const isOverride = status === OperatorStatus.Vacaciones || status === OperatorStatus.Licencia;
      
      if (op.saturdayGroup === activeGroup && !isOverride) {
        status = OperatorStatus.HomeOffice;
        horario = op.saturdayHorario || "07:00 - 13:00";
      }
    }
  }

  return { status, horario };
}

function getActiveGroupForDate(dateStr: string): string | null {
  if (!activeRotationConfig) return null;
  const { startDate, startGroup, rotationOrder } = activeRotationConfig;
  if (!startDate || !startGroup || !rotationOrder) return null;

  const dateObj = new Date(dateStr + "T12:00:00");
  const isSaturday = dateObj.getDay() === 6;
  if (!isSaturday) return null;

  const start = new Date(startDate + "T12:00:00");
  const diffDays = Math.round((dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const weeksDiff = Math.floor(diffDays / 7);
  const groups = rotationOrder.split(",").map((g) => g.trim());
  const N = groups.length;
  if (N === 0) return null;

  const startIndex = groups.indexOf(startGroup);
  const idx = startIndex >= 0 ? startIndex : 0;
  const activeIndex = ((idx + weeksDiff) % N + N) % N;
  return groups[activeIndex];
}

function getNextSaturdayForGroup(targetGroup: string): string | null {
  if (!activeRotationConfig) return null;
  const { startDate, startGroup, rotationOrder } = activeRotationConfig;
  if (!startDate || !startGroup || !rotationOrder) return null;

  const groups = rotationOrder.split(",").map((g) => g.trim());
  const N = groups.length;
  if (N === 0) return null;
  if (!groups.includes(targetGroup)) return null;

  const start = new Date(startDate + "T12:00:00");
  const startIndex = groups.indexOf(startGroup);
  const targetIndex = groups.indexOf(targetGroup);

  const offsetWeeks = ((targetIndex - startIndex) % N + N) % N;
  const firstDate = new Date(start);
  firstDate.setDate(firstDate.getDate() + offsetWeeks * 7);

  const y = firstDate.getFullYear();
  const m = String(firstDate.getMonth() + 1).padStart(2, '0');
  const d = String(firstDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDatesArrayForCurrentMonth(): string[] {
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

function updateDateInputDisplay(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const dateDisplay = document.getElementById('date-input-display');

  if (dateInput && dateDisplay && dateInput.value) {
    dateDisplay.innerText = formatDMY(dateInput.value);
  }
}

function sortOperators(ops: OperatorData[], dateStr: string): OperatorData[] {
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
    
    if (sortType === 'inconsistencies') {
      const hasInconsistency = (op: OperatorData): boolean => {
        const [yearStr, monthStr] = dateStr.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const daysInMonth = getDaysInMonth(year, month);
        const currentMonthPrefix = `${yearStr}-${monthStr}`;
        const dates = Array.from({length: daysInMonth}, (_, i) => `${currentMonthPrefix}-${(i + 1).toString().padStart(2, '0')}`);
        
        const opMaxHO = (op.maxConsecutiveHO !== undefined && op.maxConsecutiveHO !== null) ? op.maxConsecutiveHO : state.maxConsecutiveHOLimit;
        const opMinPWeek = (op.minPWeek !== undefined && op.minPWeek !== null) ? op.minPWeek : state.minPWeekLimit;

        let maxConsecutiveHO = 0;
        let currentHO = 0;
        
        let pWeekViolation = false;
        let currentWeekP = 0;
        let currentWeekDays = 0;

        for (let i = 0; i < dates.length; i++) {
          const d = dates[i];
          const status = op.asistencia[d];
          
          if (status === OperatorStatus.HomeOffice) {
            currentHO++;
            maxConsecutiveHO = Math.max(maxConsecutiveHO, currentHO);
          } else if (status !== OperatorStatus.Franco && status) {
            currentHO = 0;
          }

          if (status === OperatorStatus.PresencialMonteGrande || status === OperatorStatus.PresencialParquePatricios) currentWeekP++;
          if (status !== OperatorStatus.Franco && status !== OperatorStatus.Licencia && status !== OperatorStatus.Vacaciones && status) {
             currentWeekDays++;
          }
          
          const dateObj = new Date(d + 'T12:00:00');
          const dayOfWeek = dateObj.getDay();
          
          if (dayOfWeek === 0 || d === dates[dates.length - 1]) {
             if (currentWeekDays >= 5 && currentWeekP < opMinPWeek) {
                pWeekViolation = true;
             }
             currentWeekP = 0;
             currentWeekDays = 0;
          }
        }
        
        return maxConsecutiveHO > opMaxHO || pWeekViolation;
      };
      
      const incA = hasInconsistency(a) ? 1 : 0;
      const incB = hasInconsistency(b) ? 1 : 0;
      
      if (incA !== incB) {
        return incB - incA;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    }
    
    return 0;
  });
}

function updateNavigationButtons(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const nextBtn = document.getElementById('next-month-btn') as HTMLButtonElement | null;
  const prevBtn = document.getElementById('prev-month-btn') as HTMLButtonElement | null;
  if (!dateInput || !state.cronoData) return;

  const currentYM = dateInput.value.slice(0, 7);
  const currentIndex = state.uniqueMonths.indexOf(currentYM);

  if (state.uniqueMonths.length === 0) {
    if (nextBtn) nextBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    return;
  }

  if (nextBtn) {
    const hasNext = currentIndex !== -1 && currentIndex < state.uniqueMonths.length - 1;
    nextBtn.disabled = !hasNext;
    if (!hasNext) {
      nextBtn.classList.add('opacity-30', 'cursor-not-allowed');
      nextBtn.classList.remove('hover:bg-base-200');
    } else {
      nextBtn.classList.remove('opacity-30', 'cursor-not-allowed');
      nextBtn.classList.add('hover:bg-base-200');
    }
  }

  if (prevBtn) {
    const hasPrev = currentIndex > 0;
    prevBtn.disabled = !hasPrev;
    if (!hasPrev) {
      prevBtn.classList.add('opacity-30', 'cursor-not-allowed');
      prevBtn.classList.remove('hover:bg-base-200');
    } else {
      prevBtn.classList.remove('opacity-30', 'cursor-not-allowed');
      prevBtn.classList.add('hover:bg-base-200');
    }
  }
}

function updateGroupsActiveMonthBadge(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const badge = document.getElementById('groups-active-month-badge');
  if (badge && dateInput && dateInput.value) {
    const currentYM = dateInput.value.slice(0, 7);
    const [yearStr, monthStr] = currentYM.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const dateObj = new Date(year, month, 15);
    const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
    badge.innerText = `Mes: ${formatter.format(dateObj)}`;
  }
}

function updateMonthDisplay(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const display = document.getElementById('current-month-display');
  if (!dateInput || !display) return;

  const value = dateInput.value;
  if (!value || !value.includes('-')) {
    display.innerText = "-";
    return;
  }

  const [yearStr, monthStr] = value.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const dateObj = new Date(year, month, 15);
  const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
  display.innerText = formatter.format(dateObj);

  updateNavigationButtons();
  updateGroupsActiveMonthBadge();
}

function renderMonthDropdown(): void {
  const list = document.getElementById('month-dropdown-list');
  if (!list) return;

  let html = '';
  state.uniqueMonths.forEach(ymStr => {
    const [yearStr, monthStr] = ymStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const dateObj = new Date(year, month, 15);
    const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
    const label = formatter.format(dateObj).toUpperCase();

    html += `
      <li>
        <a class="text-[10px] font-bold py-1.5 px-3 rounded-lg hover:bg-secondary/10 hover:text-secondary focus:bg-secondary/20 transition-all cursor-pointer flex items-center justify-between" data-month-val="${ymStr}-01">
          <span>${label}</span>
        </a>
      </li>
    `;
  });

  list.innerHTML = html;

  // Attach click listeners
  list.querySelectorAll('[data-month-val]').forEach(item => {
    item.addEventListener('click', (e) => {
      const val = (e.currentTarget as HTMLElement).getAttribute('data-month-val');
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
    });
  });
}

function changeMonth(offset: number): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  if (!dateInput) return;

  if (state.uniqueMonths.length === 0) return;

  const currentYM = dateInput.value.slice(0, 7);
  const currentIndex = state.uniqueMonths.indexOf(currentYM);
  
  if (currentIndex === -1) return;

  let newIndex = currentIndex + offset;
  if (newIndex < 0) newIndex = 0;
  if (newIndex >= state.uniqueMonths.length) newIndex = state.uniqueMonths.length - 1;

  const targetYM = state.uniqueMonths[newIndex];
  if (targetYM === currentYM) return;

  const [yearStr, monthStr] = targetYM.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const dayStr = dateInput.value.split('-')[2];
  let day = parseInt(dayStr, 10);
  const daysInNewMonth = getDaysInMonth(year, month);
  if (day > daysInNewMonth) {
    day = daysInNewMonth;
  }

  dateInput.value = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  updateDateInputDisplay();
  reloadDataForActiveMonth(targetYM);
}

async function loadRotationConfig(month: string): Promise<void> {
  try {
    const rotRes = await fetch(`/api/cronograma/rotation-config?month=${month}`);
    if (rotRes.ok) {
      activeRotationConfig = await rotRes.json();
    } else {
      activeRotationConfig = null;
    }
  } catch (err) {
    console.warn("Failed to load rotation config:", err);
    activeRotationConfig = null;
  }
}

async function reloadDataForActiveMonth(targetMonth?: string): Promise<void> {
  try {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const monthToLoad = targetMonth || (dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7));

    const payload = await fetchCronogramaFullData(monthToLoad);
    state.cronoData = payload.operators;
    overtimeConfigs = payload.weekendOvertimeConfigs;
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
    overtimeConfigs = payload.weekendOvertimeConfigs;
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

function renderDaily(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const selectedDateStr = dateInput?.value || formatYMD(new Date());
  const tableBody = document.getElementById('operators-table-body');
  const dateDisplay = document.getElementById('daily-date-display');

  const isHoliday = isFeriado(selectedDateStr);
  const feriadoName = getFeriadoName(selectedDateStr);

  if (dateDisplay) {
    const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const dateObj = new Date(selectedDateStr + 'T12:00:00');
    let displayText = formatter.format(dateObj);
    if (isHoliday && feriadoName) {
      displayText += ` (Feriado: ${feriadoName})`;
    }
    dateDisplay.innerText = displayText;
  }

  const filteredOps = state.cronoData.filter(op => {
    const { status } = resolveOperatorStatusAndHorario(op, selectedDateStr);
    if (!status) return false;

    // 1. Search Query filter (case-insensitive name check)
    const matchesSearch = !state.searchQuery || op.nombre.toLowerCase().includes(state.searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // 2. Location Filter
    if (state.activeLocationFilter !== 'all' && (op.location || "Monte Grande") !== state.activeLocationFilter) {
      return false;
    }

    // 3. Status Filter
    if (state.activeFilter === 'all') return true;
    if (state.activeFilter === 'Licencia') {
      return status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones;
    }
    return status === state.activeFilter;
  });

  const sortedOps = sortOperators(filteredOps, selectedDateStr);

  let rowsHtml = '';
  if (sortedOps.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="3" class="py-16 text-center text-base-content/40 font-bold bg-base-100/50 border border-dashed border-base-300/40">
          <div class="flex flex-col items-center justify-center gap-3 py-6">
            <div class="w-12 h-12 rounded-2xl bg-base-200/50 flex items-center justify-center text-base-content/30 border border-base-300/40">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <div class="flex flex-col">
              <span class="text-xs uppercase tracking-widest font-black text-base-content/70">Sin resultados</span>
              <span class="text-[10px] text-base-content/40 font-medium normal-case mt-0.5">Ningún operador coincide con tu búsqueda o filtro.</span>
            </div>
          </div>
        </td>
      </tr>
    `;
  } else {
    sortedOps.forEach(op => {
      const { status, horario: dailyHorario } = resolveOperatorStatusAndHorario(op, selectedDateStr);
      const styles = getStatusStyles(status);
      const isAbsent = status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones;
      const isFranco = status === OperatorStatus.Franco;
      const initials = op.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
      const username = op.username || '';
      const customBreakInicio = op.breaks_inicio?.[selectedDateStr] || '';
      const customBreakFin = op.breaks_fin?.[selectedDateStr] || '';
      
      const dateObj = new Date(selectedDateStr + 'T12:00:00');
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      
      const dayOvertime = (op.weekendOvertimes || []).find(s => s.date === selectedDateStr);
      let liveStatus = isCurrentlyWorking(dailyHorario, customBreakInicio, customBreakFin, isWeekend);
      if (dayOvertime) {
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        const otStartMin = timeToMinutes(dayOvertime.startTime);
        const otEndMin = timeToMinutes(dayOvertime.endTime);
        const isWithinOvertime = otEndMin >= otStartMin 
          ? (currentMin >= otStartMin && currentMin < otEndMin)
          : (currentMin >= otStartMin || currentMin < otEndMin);
        if (isWithinOvertime) {
          liveStatus = { status: 'online', text: 'Trabajando (Hora Extra)' };
        }
      }
      const showAsActiveInGantt = (!isAbsent && !isFranco) || !!dayOvertime;
      
      // Calcular descanso (personalizado o fallback de 1hr en el medio del shift)
      let breakStartHourStr = '';
      let breakEndHourStr = '';
      if (!isAbsent && !isFranco && !isWeekend) {
        const times = dailyHorario.split(' - ');
        if (times.length === 2) {
          if (customBreakInicio && customBreakFin) {
            breakStartHourStr = customBreakInicio;
            breakEndHourStr = customBreakFin;
          } else {
            const startMin = timeToMinutes(times[0]);
            const endMin = timeToMinutes(times[1]);
            const totalMin = endMin >= startMin ? (endMin - startMin) : (1440 - startMin + endMin);
            const breakStartMin = (startMin + (totalMin / 2) - 30) % 1440;
            breakStartHourStr = `${Math.floor(breakStartMin / 60).toString().padStart(2, '0')}:${Math.floor(breakStartMin % 60).toString().padStart(2, '0')}`;
            const breakEndMin = (breakStartMin + 60) % 1440;
            breakEndHourStr = `${Math.floor(breakEndMin / 60).toString().padStart(2, '0')}:${Math.floor(breakEndMin % 60).toString().padStart(2, '0')}`;
          }
        }
      }

      let breakBadgeHtml = '';
      if (breakStartHourStr && breakEndHourStr) {
        breakBadgeHtml = `
          <span class="daily-break-badge px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1 shadow-sm shrink-0" title="Break: ${breakStartHourStr} - ${breakEndHourStr}">
            <svg class="w-3 h-3 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" y1="2" x2="6" y2="4" />
              <line x1="10" y1="2" x2="10" y2="4" />
              <line x1="14" y1="2" x2="14" y2="4" />
            </svg>
            ${breakStartHourStr} - ${breakEndHourStr}
          </span>
        `;
      }

      let liveIndicatorClass = "bg-base-content/10";
      if (liveStatus.status === 'online') liveIndicatorClass = "bg-success shadow-[0_0_8px_rgba(6,132,68,0.4)]";
      else if (liveStatus.status === 'break') liveIndicatorClass = "bg-warning shadow-[0_0_8px_rgba(226,173,31,0.4)]";

      let ringClass = "bg-base-200/50 text-base-content/60 ring-base-200 border border-base-300";
      let glowColorClass = "bg-primary";
      if (status === OperatorStatus.HomeOffice) {
        ringClass = "bg-secondary/10 text-secondary ring-secondary/30 border border-secondary/20 shadow-sm";
        glowColorClass = "bg-secondary";
      } else if (status === OperatorStatus.PresencialMonteGrande) {
        ringClass = "bg-primary/10 text-amber-600 dark:text-amber-400 ring-primary/30 border border-primary/20 shadow-sm";
        glowColorClass = "bg-amber-500";
      } else if (status === OperatorStatus.PresencialParquePatricios) {
        ringClass = "bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-purple-500/30 border border-purple-500/20 shadow-sm";
        glowColorClass = "bg-purple-500";
      }

      // Contenido del Gantt
      let ganttContentHtml = '';

      const getPct = (timeStr: string) => {
        const parts = timeStr.split(':');
        const mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        return (mins / 1440) * 100;
      };

      const workBars: string[] = [];
      const breakBars: string[] = [];

      // Helper for adding line-through to work bar spans
      const ganttSpanClass = (bg: string) => `relative z-10 text-[9px] font-extrabold tracking-tight uppercase px-1.5 py-0.5 rounded ${bg} pointer-events-none ${isHoliday ? 'line-through' : ''}`;
      // Helper for adding line-through to inactive bar divs
      const ganttInactiveBarClass = (bg: string) => `gantt-inactive-bar ${bg} ${isHoliday ? 'line-through' : ''}`;

      // --- 1. YESTERDAY'S SHIFT CONTINUATION ---
      let hasYesterdayContinuation = false;
      let yEndPct = 0;
      const prevDate = new Date(selectedDateStr + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = formatYMD(prevDate);

      const yesterdayStatus = op.asistencia[prevDateStr];
      const isYesterdayAbsent = yesterdayStatus === OperatorStatus.Licencia || yesterdayStatus === OperatorStatus.Vacaciones || yesterdayStatus === OperatorStatus.Franco;

      if (yesterdayStatus && !isYesterdayAbsent) {
        const yesterdayHorario = (op.horarios_dias && op.horarios_dias[prevDateStr]) || op.horario;
        const yTimes = yesterdayHorario.split(' - ');
        if (yTimes.length === 2) {
          const yStartPct = getPct(yTimes[0]);
          const yEndPctVal = getPct(yTimes[1]);

          if (yStartPct > yEndPctVal) {
            hasYesterdayContinuation = true;
            yEndPct = yEndPctVal;
            let yesterdayWorkBarBg = 'bg-primary text-amber-900';
            if (yesterdayStatus === OperatorStatus.HomeOffice) yesterdayWorkBarBg = 'bg-secondary text-secondary-content';
            else if (yesterdayStatus === OperatorStatus.PresencialParquePatricios) yesterdayWorkBarBg = 'bg-purple-500 text-white';

            workBars.push(`
              <div class="gantt-bar-work ${yesterdayWorkBarBg} relative" style="left: 0%; width: ${yEndPct}%; border-top-left-radius: 0; border-bottom-left-radius: 0;">
                <span class="${ganttSpanClass(yesterdayWorkBarBg)}">${yTimes[0]} - ${yTimes[1]}</span>
              </div>
            `);

            const yDateObj = new Date(prevDateStr + 'T12:00:00');
            const yIsWeekend = yDateObj.getDay() === 0 || yDateObj.getDay() === 6;
            if (!yIsWeekend) {
              const yBreakInicio = op.breaks_inicio?.[prevDateStr] || '';
              const yBreakFin = op.breaks_fin?.[prevDateStr] || '';
              let yBreakStartHourStr = '';
              let yBreakEndHourStr = '';
              if (yBreakInicio && yBreakFin) {
                yBreakStartHourStr = yBreakInicio;
                yBreakEndHourStr = yBreakFin;
              } else {
                const startMin = timeToMinutes(yTimes[0]);
                const endMin = timeToMinutes(yTimes[1]);
                const totalMin = endMin >= startMin ? (endMin - startMin) : (1440 - startMin + endMin);
                const breakStartMin = (startMin + (totalMin / 2) - 30) % 1440;
                yBreakStartHourStr = `${Math.floor(breakStartMin / 60).toString().padStart(2, '0')}:${Math.floor(breakStartMin % 60).toString().padStart(2, '0')}`;
                const breakEndMin = (breakStartMin + 60) % 1440;
                yBreakEndHourStr = `${Math.floor(breakEndMin / 60).toString().padStart(2, '0')}:${Math.floor(breakEndMin % 60).toString().padStart(2, '0')}`;
              }
              const yBStartPct = getPct(yBreakStartHourStr);
              const yBEndPct = getPct(yBreakEndHourStr);

              if (yBStartPct < yStartPct) {
                if (yBStartPct <= yBEndPct) {
                  breakBars.push(`
                    <div class="gantt-bar-break" style="left: ${yBStartPct}%; width: ${yBEndPct - yBStartPct}%;">
                      <span class="gantt-break-tooltip">Break: ${yBreakStartHourStr} - ${yBreakEndHourStr}</span>
                    </div>
                  `);
                } else {
                  breakBars.push(`
                    <div class="gantt-bar-break" style="left: 0%; width: ${yBEndPct}%;">
                      <span class="gantt-break-tooltip">Break: ${yBreakStartHourStr} - ${yBreakEndHourStr}</span>
                    </div>
                  `);
                }
              } else if (yBStartPct > yBEndPct) {
                breakBars.push(`
                  <div class="gantt-bar-break" style="left: 0%; width: ${yBEndPct}%;">
                    <span class="gantt-break-tooltip">Break: ${yBreakStartHourStr} - ${yBreakEndHourStr}</span>
                  </div>
                `);
              }
            }

          }
        }
      }

      // --- 2. TODAY'S SHIFT OR INACTIVE BAR ---
      if (!showAsActiveInGantt) {
        const inactiveText = isFranco ? 'Franco / Día Libre' : (status === OperatorStatus.Vacaciones ? 'Vacaciones' : 'Licencia Médica');
        let inactiveBg = isFranco ? 'bg-base-200 text-base-content/40 border border-base-300/40' : (status === OperatorStatus.Vacaciones ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20');
        if (isHoliday) inactiveBg = '!bg-orange-200/60 dark:!bg-orange-600/60 !text-orange-800 dark:!text-orange-100 !border-orange-300 dark:!border-orange-500';
        
        if (hasYesterdayContinuation) {
          ganttContentHtml = `
            <!-- Líneas de cuadrícula de fondo -->
            <div class="gantt-grid-line" style="left: 8.33%;"></div>
            <div class="gantt-grid-line" style="left: 16.66%;"></div>
            <div class="gantt-grid-line" style="left: 25.00%;"></div>
            <div class="gantt-grid-line" style="left: 33.33%;"></div>
            <div class="gantt-grid-line" style="left: 41.66%;"></div>
            <div class="gantt-grid-line" style="left: 50.00%;"></div>
            <div class="gantt-grid-line" style="left: 58.33%;"></div>
            <div class="gantt-grid-line" style="left: 66.66%;"></div>
            <div class="gantt-grid-line" style="left: 75.00%;"></div>
            <div class="gantt-grid-line" style="left: 83.33%;"></div>
            <div class="gantt-grid-line" style="left: 91.66%;"></div>

            <!-- Barras de Turno Planificado -->
            ${workBars.join('')}

            <!-- Bloques de Break por encima -->
            ${breakBars.join('')}

            <!-- Barra Inactiva a la derecha de la continuación -->
            <div class="${ganttInactiveBarClass(inactiveBg)} absolute" style="left: calc(${yEndPct}% + 8px); width: calc(${100 - yEndPct}% - 16px); z-index: 2;">
              ${inactiveText}
            </div>
          `;
        } else {
          ganttContentHtml = `
            <div class="${ganttInactiveBarClass(inactiveBg)}">
              ${inactiveText}
            </div>
          `;
        }
      } else {
        if (!isAbsent && !isFranco) {
          const times = dailyHorario.split(' - ');
          if (times.length === 2) {
            const startPct = getPct(times[0]);
            const endPct = getPct(times[1]);
            let workBarBg = 'bg-primary text-amber-900';
            if (status === OperatorStatus.HomeOffice) workBarBg = 'bg-secondary text-secondary-content';
            else if (status === OperatorStatus.PresencialParquePatricios) workBarBg = 'bg-purple-500 text-white';
            if (isHoliday) workBarBg = '!bg-orange-500 dark:!bg-orange-600 !text-orange-900 dark:!text-orange-100';

            if (startPct <= endPct) {
              const widthPct = endPct - startPct;
              workBars.push(`
                <div class="gantt-bar-work ${workBarBg} relative" style="left: ${startPct}%; width: ${widthPct}%;">
                  <span class="${ganttSpanClass(workBarBg)}">${times[0]} - ${times[1]}</span>
                </div>
              `);
            } else {
              const widthPct = 100 - startPct;
              workBars.push(`
                <div class="gantt-bar-work ${workBarBg} relative" style="left: ${startPct}%; width: ${widthPct}%; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                  <span class="${ganttSpanClass(workBarBg)}">${times[0]} - ${times[1]}</span>
                </div>
              `);
            }

            if (breakStartHourStr && breakEndHourStr) {
              const bStartPct = getPct(breakStartHourStr);
              const bEndPct = getPct(breakEndHourStr);

              if (startPct <= endPct) {
                const bWidthPct = bEndPct >= bStartPct ? (bEndPct - bStartPct) : (100 - bStartPct + bEndPct);
                breakBars.push(`
                  <div class="gantt-bar-break" style="left: ${bStartPct}%; width: ${bWidthPct}%;">
                    <span class="gantt-break-tooltip">Break: ${breakStartHourStr} - ${breakEndHourStr}</span>
                  </div>
                `);
              } else {
                if (bStartPct >= startPct) {
                  const bWidthPct = bEndPct >= bStartPct ? (bEndPct - bStartPct) : (100 - bStartPct);
                  breakBars.push(`
                    <div class="gantt-bar-break" style="left: ${bStartPct}%; width: ${bWidthPct}%;">
                      <span class="gantt-break-tooltip">Break: ${breakStartHourStr} - ${breakEndHourStr}</span>
                    </div>
                  `);
                }
              }
            }
          }
        }

        if (dayOvertime) {
          const otStartPct = getPct(dayOvertime.startTime);
          const otEndPct = getPct(dayOvertime.endTime);
          const otBarBg = 'bg-warning/90 text-warning-content border border-warning';

          if (otStartPct <= otEndPct) {
            const widthPct = otEndPct - otStartPct;
            workBars.push(`
              <div class="gantt-bar-work ${otBarBg} relative" style="left: ${otStartPct}%; width: ${widthPct}%;">
                <span class="${ganttSpanClass(otBarBg)} font-black uppercase text-[8.5px]">HE: ${dayOvertime.startTime} - ${dayOvertime.endTime}</span>
              </div>
            `);
          } else {
            const widthPct = 100 - otStartPct;
            workBars.push(`
              <div class="gantt-bar-work ${otBarBg} relative" style="left: ${otStartPct}%; width: ${widthPct}%; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                <span class="${ganttSpanClass(otBarBg)} font-black uppercase text-[8.5px]">HE: ${dayOvertime.startTime} - ${dayOvertime.endTime}</span>
              </div>
            `);
          }
        }

        ganttContentHtml = `
          <!-- Líneas de cuadrícula de fondo -->
          <div class="gantt-grid-line" style="left: 8.33%;"></div>
          <div class="gantt-grid-line" style="left: 16.66%;"></div>
          <div class="gantt-grid-line" style="left: 25.00%;"></div>
          <div class="gantt-grid-line" style="left: 33.33%;"></div>
          <div class="gantt-grid-line" style="left: 41.66%;"></div>
          <div class="gantt-grid-line" style="left: 50.00%;"></div>
          <div class="gantt-grid-line" style="left: 58.33%;"></div>
          <div class="gantt-grid-line" style="left: 66.66%;"></div>
          <div class="gantt-grid-line" style="left: 75.00%;"></div>
          <div class="gantt-grid-line" style="left: 83.33%;"></div>
          <div class="gantt-grid-line" style="left: 91.66%;"></div>

          <!-- Barras de Turno Planificado / Horas Extras -->
          ${workBars.join('')}

          <!-- Bloques de Break por encima -->
          ${breakBars.join('')}
        `;
      }

      let trClass = "hover:bg-base-200/40 transition-all duration-200 group border-b border-base-200/50 last:border-0";
      if (isHoliday) {
        trClass += " bg-orange-100/30 dark:bg-orange-950/30 pointer-events-none";
      }

      let opNameBtnClass = "font-bold text-sm text-base-content truncate group-hover:text-secondary transition-colors text-left hover:underline underline-offset-4";
      if (isHoliday) {
        opNameBtnClass += " text-orange-600 dark:text-orange-400";
      }

      rowsHtml += `
        <tr class="${trClass}">
          <td class="sticky left-0 bg-base-100 z-30 w-64 min-w-[16rem] px-6 py-4 border-r border-base-300/40 relative group-hover:bg-base-200 transition-colors">
            <div class="flex items-center gap-4">
              <div class="relative w-10 h-10 shrink-0">
                <div class="absolute inset-0 rounded-full blur-[2px] opacity-0 group-hover:opacity-30 transition-opacity duration-300 ${glowColorClass}"></div>
                <div class="relative w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-black ring-1 ring-base-300 transition-all duration-300 group-hover:scale-110 group-hover:ring-offset-2 group-hover:ring-offset-base-100 ${ringClass}">
                  ${initials}
                </div>
                <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-base-100 ${liveIndicatorClass}" title="${liveStatus.text}"></div>
              </div>
              <div class="flex flex-col min-w-0">
                <button 
                  class="${opNameBtnClass}"
                  data-op-profile="${op.nombre}"
                >
                  ${op.nombre}
                </button>
                <span class="text-[10px] text-base-content/40 font-black tracking-widest uppercase truncate">${username}</span>
              </div>
            </div>
          </td>
          <td class="sticky left-[16rem] bg-base-100 z-30 w-44 min-w-[11rem] px-4 py-4 border-r border-base-300/40 group-hover:bg-base-200 transition-colors shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">
            <div class="flex items-center gap-3">
               <div class="w-8 h-8 rounded-lg flex items-center justify-center text-base border border-base-300/30 ${isHoliday ? '!bg-orange-200 dark:!bg-orange-600 !text-orange-800 dark:!text-orange-100 !border-orange-300 dark:!border-orange-500' : styles.bgClass}">
                  ${styles.icon}
               </div>
               <div class="flex flex-col gap-1 items-start">
                  <span class="${isHoliday ? '!bg-orange-200 dark:!bg-orange-600 !text-orange-800 dark:!text-orange-100 !border-orange-300 dark:!border-orange-500 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase line-through whitespace-nowrap' : styles.badge} whitespace-nowrap">${status}</span>
                 ${breakBadgeHtml}
                 ${dayOvertime ? `
                   <span class="px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-warning/15 text-warning border border-warning/20 flex items-center gap-1 shadow-sm shrink-0 whitespace-nowrap mt-1" title="Hora Extra: ${dayOvertime.startTime} - ${dayOvertime.endTime}">
                     ⚡ HE: ${dayOvertime.startTime} - ${dayOvertime.endTime}
                   </span>
                 ` : ''}
               </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="gantt-container">
              ${ganttContentHtml}
            </div>
          </td>
        </tr>
      `;
    });
  }

  if (tableBody) tableBody.innerHTML = rowsHtml;
}

function isWorkingAtHour(horario: string, hourStr: string): boolean {
  if (!horario || horario === '-' || horario === 'Franco') return false;
  const parts = horario.split(' - ');
  if (parts.length !== 2) return false;
  const start = parts[0];
  const end = parts[1];

  const hS = parseInt(start.split(':')[0], 10);
  const hE = parseInt(end.split(':')[0], 10);
  const hC = parseInt(hourStr.split(':')[0], 10);

  if (hS <= hE) {
     return hC >= hS && hC < hE;
  } else {
     return hC >= hS || hC < hE;
  }
}

function isBreakAtHour(breakInicio: string, breakFin: string, hourStr: string): boolean {
  if (!breakInicio || !breakFin || breakInicio === '-' || breakFin === '-') return false;
  const hS = parseInt(breakInicio.split(':')[0], 10);
  const hE = parseInt(breakFin.split(':')[0], 10);
  const hC = parseInt(hourStr.split(':')[0], 10);

  if (hS <= hE) {
     return hC >= hS && hC < hE;
  } else {
     return hC >= hS || hC < hE;
  }
}

function renderHourly(dateStr: string): void {
  const thead = document.getElementById('monthly-thead');
  const tbody = document.getElementById('monthly-tbody');
  const tfoot = document.getElementById('monthly-tfoot');
  
  const hours = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
  const formatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
  let formattedDate = formatter.format(new Date(dateStr + 'T12:00:00')).toUpperCase();

  const isHoliday = isFeriado(dateStr);
  const feriadoName = getFeriadoName(dateStr);
  if (isHoliday && feriadoName) {
    formattedDate += ` - FERIADO: ${feriadoName.toUpperCase()}`;
  }

  let theadHtml = `
    <tr>
      <th rowspan="2" class="sticky top-0 left-0 bg-base-100 z-50 w-[200px] min-w-[200px] border-r border-b border-base-200 px-6 py-4 font-black text-xs uppercase tracking-widest text-base-content/50">Operador</th>
      <th colspan="${hours.length}" class="sticky top-0 text-center py-3 bg-base-100 text-secondary border-b border-base-200 relative group z-40">
         <button type="button" data-close-hourly class="absolute left-4 top-1/2 -translate-y-1/2 btn btn-xs btn-outline hover:bg-secondary/10 border-secondary/20 hover:border-secondary/40 text-secondary h-8 px-3 rounded-lg transition-all shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left mr-1"><path d="m15 18-6-6 6-6"/></svg>
            Volver al mes
         </button>
         <span class="font-black tracking-widest uppercase text-sm">Vista Diaria: ${formattedDate}</span>
      </th>
    </tr>
    <tr>
  `;
  
  hours.forEach(hour => {
    theadHtml += `<th class="sticky top-[44px] text-center min-w-[3rem] px-0 border-r border-b border-base-200 py-2 bg-base-100 z-40">
      <span class="font-extrabold text-[10px] tracking-wide text-base-content/60">${hour}</span>
    </th>`;
  });
  theadHtml += `</tr>`;
  if (thead) thead.innerHTML = theadHtml;

  const filteredOps = state.cronoData.filter(op => {
    const matchesSearch = !state.searchQuery || op.nombre.toLowerCase().includes(state.searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (state.activeLocationFilter !== 'all' && (op.location || "Monte Grande") !== state.activeLocationFilter) {
      return false;
    }

    if (state.activeFilter === 'all') return true;
    const status = op.asistencia[dateStr];
    if (state.activeFilter === 'Licencia') {
      return status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones;
    }
    return status === state.activeFilter;
  });

  const sortedOps = sortOperators(filteredOps, dateStr);

  let tbodyHtml = '';
  if (sortedOps.length === 0) {
     tbodyHtml = `<tr><td colspan="${hours.length + 1}" class="py-16 text-center text-base-content/40 font-bold bg-base-100/50">Sin resultados</td></tr>`;
  } else {
     sortedOps.forEach(op => {
        const status = op.asistencia[dateStr] || OperatorStatus.Franco;
        const horario = (op.horarios_dias && op.horarios_dias[dateStr]) || op.horario;
        const styles = getStatusStyles(status);
        const isAbsent = status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones;
        const isFranco = status === OperatorStatus.Franco;
        
        let rowClass = "group hover:bg-base-200/40 transition-all border-b border-base-200/50";
        if (isHoliday) {
            rowClass += " bg-orange-100/30 dark:bg-orange-950/30 pointer-events-none";
        }
        let tdClass = "sticky left-0 bg-base-100 z-30 w-[200px] min-w-[200px] font-bold py-3 px-6 text-xs border-r border-base-200/70 group-hover:bg-base-200 transition-colors";

        const dateObj = new Date(dateStr + 'T12:00:00');
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

        const customBreakInicio = op.breaks_inicio?.[dateStr] || '';
        const customBreakFin = op.breaks_fin?.[dateStr] || '';
        let breakStart = '';
        let breakEnd = '';
        if (!isAbsent && !isFranco && !isWeekend) {
          const times = horario.split(' - ');
          if (times.length === 2) {
            if (customBreakInicio && customBreakFin) {
              breakStart = customBreakInicio;
              breakEnd = customBreakFin;
            } else {
              const startMin = timeToMinutes(times[0]);
              const endMin = timeToMinutes(times[1]);
              const totalMin = endMin >= startMin ? (endMin - startMin) : (1440 - startMin + endMin);
              const breakStartMin = (startMin + (totalMin / 2) - 30) % 1440;
              breakStart = `${Math.floor(breakStartMin / 60).toString().padStart(2, '0')}:${Math.floor(breakStartMin % 60).toString().padStart(2, '0')}`;
              const breakEndMin = (breakStartMin + 60) % 1440;
              breakEnd = `${Math.floor(breakEndMin / 60).toString().padStart(2, '0')}:${Math.floor(breakEndMin % 60).toString().padStart(2, '0')}`;
            }
          }
        }

        let opNameBtnClass = "hover:text-secondary hover:underline underline-offset-2 transition-all text-left truncate flex-1 font-bold text-xs";
        if (isHoliday) {
           opNameBtnClass += " text-orange-600 dark:text-orange-400";
        }

        let spanClass = `text-[9px] ${isAbsent ? 'text-error' : isFranco ? 'text-base-content/40' : 'text-base-content/60'} font-black tracking-widest uppercase truncate mt-0.5`;
        if (isHoliday) {
           spanClass += " text-orange-600 dark:text-orange-400";
        }

        tbodyHtml += `<tr class="${rowClass}">
           <td class="${tdClass}">
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5 overflow-hidden">
                  <button class="${opNameBtnClass}" data-op-profile="${op.nombre}">${op.nombre}</button>
                </div>
                <span class="${spanClass}">${horario} - ${status}</span>
              </div>
           </td>
        `;

        hours.forEach(hour => {
           const working = isWorkingAtHour(horario, hour);
           const onBreak = working && isBreakAtHour(breakStart, breakEnd, hour);
           if (onBreak) {
              tbodyHtml += `<td class="border-r border-base-200/50 p-1 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                 <div class="hourly-break-cell w-full h-full rounded border border-dashed border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity min-h-[1.75rem] shadow-sm cursor-help" title="Descanso: ${breakStart} - ${breakEnd}">
                   <span class="text-[10px] leading-none">☕</span>
                 </div>
              </td>`;
            } else if (working && !isFranco) {
               const hourBgClass = isHoliday ? '!bg-orange-200 dark:!bg-orange-600 !text-orange-800 dark:!text-orange-100' : styles.bgClass;
               tbodyHtml += `<td class="border-r border-base-200/50 p-1 bg-base-200/10">
                  <div class="w-full h-full rounded ${hourBgClass} flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity min-h-[1.75rem] shadow-sm">
                  </div>
               </td>`;
           } else {
              tbodyHtml += `<td class="border-r border-b border-base-200/50 bg-base-100/50"></td>`;
           }
        });
        tbodyHtml += `</tr>`;
     });
  }
  if (tbody) tbody.innerHTML = tbodyHtml;
  
  if (tfoot) tfoot.innerHTML = `<tr><td colspan="${hours.length + 1}" class="bg-base-200 py-3 text-center border-t border-base-300 text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em]">Fin del reporte diario</td></tr>`;
}

function renderMonthly(): void {
  if (state.focusedDateStr) {
    renderHourly(state.focusedDateStr);
    return;
  }

  const thead = document.getElementById('monthly-thead');
  const tbody = document.getElementById('monthly-tbody');
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const selectedDateStr = dateInput?.value || formatYMD(new Date());
  
  const [yearStr, monthStr] = selectedDateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const daysInMonth = getDaysInMonth(year, month);
  const currentMonthPrefix = `${yearStr}-${monthStr}`;
  
  const dates = Array.from({length: daysInMonth}, (_, i) => `${currentMonthPrefix}-${(i + 1).toString().padStart(2, '0')}`);
  const todayStr = formatYMD(new Date());

  // --- RULE: Coverage Pre-calculation ---
  const coveragePerDay: Record<string, { total: number; licenses: number }> = {};
  dates.forEach(d => {
    let active = 0;
    let lics = 0;
    state.cronoData.forEach(op => {
      const s = op.asistencia[d];
      if (s === OperatorStatus.PresencialMonteGrande || s === OperatorStatus.PresencialParquePatricios || s === OperatorStatus.HomeOffice) active++;
      if (s === OperatorStatus.Licencia || s === OperatorStatus.Vacaciones) lics++;
    });
    coveragePerDay[d] = { total: active, licenses: lics };
  });

  const teamSize = state.cronoData.length;
  let totalInconsistencies = 0;

  const shortDayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
  const monthLongFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long' });

  const parsedDates = dates.map(date => {
    const d = new Date(date + 'T12:00:00');
    const isToday = date === todayStr;
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    const coverage = coveragePerDay[date];
    const isCritical = teamSize > 0 ? (coverage.total / teamSize) < (state.minCoveragePercent / 100) : false;
    const feriadoName = getFeriadoName(date);
    const isHoliday = !!feriadoName;
    
    let thClass = "sticky top-0 z-40 text-center min-w-[4rem] px-0 border-r border-b border-base-200 transition-colors bg-base-100";
    if (isToday) thClass += " bg-secondary text-secondary-content border-b-secondary border-b-2 z-45";
    else if (isHoliday) thClass = thClass.replace("bg-base-100", "bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100 font-bold line-through");
    else if (isWeekend) thClass = thClass.replace("bg-base-100", "bg-base-200 text-base-content/40");
    else if (isCritical) thClass += " text-error font-bold";
    else thClass += " text-base-content/70";

    const dayName = shortDayFormatter.format(d).substring(0, 2).toUpperCase();
    const dateNum = d.getDate();
    const monthName = monthLongFormatter.format(d);

    return {
      str: date,
      dateObj: d,
      isToday,
      day,
      isWeekend,
      isCritical,
      thClass,
      dayName,
      dateNum,
      monthName,
      feriadoName,
      isHoliday
    };
  });

  const totalsToggleIcon = state.isTotalsCollapsed ? 
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>` : 
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>`;

  const thShadowClass = state.isTotalsCollapsed ? 'shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]' : '';

  let theadHtml = `<tr>
    <th class="sticky top-0 left-0 bg-base-100 z-50 w-[200px] min-w-[200px] border-r border-b border-base-200 px-6 py-4 font-black text-xs uppercase tracking-widest text-base-content/50 ${thShadowClass}">
      <div class="flex items-center justify-between gap-1.5">
        <span>Operador</span>
        <button
          type="button"
          id="toggle-totals-btn"
          class="btn btn-xs btn-ghost p-0.5 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-all"
          title="${state.isTotalsCollapsed ? 'Mostrar columnas de totales' : 'Ocultar columnas de totales'}"
          aria-label="${state.isTotalsCollapsed ? 'Mostrar columnas de totales' : 'Ocultar columnas de totales'}"
        >
          ${totalsToggleIcon}
        </button>
      </div>
    </th>
  `;
  
  if (!state.isTotalsCollapsed) {
    theadHtml += `
      <th class="sticky top-0 left-[200px] bg-base-100 z-50 w-[40px] min-w-[40px] border-r border-b border-base-200 px-1 py-4 font-black text-[9px] uppercase tracking-widest text-base-content/40 text-center" title="Presencial">P</th>
      <th class="sticky top-0 left-[240px] bg-base-100 z-50 w-[40px] min-w-[40px] border-r border-b border-base-200 px-1 py-4 font-black text-[9px] uppercase tracking-widest text-base-content/40 text-center" title="Home Office">HO</th>
      <th class="sticky top-0 left-[280px] bg-base-100 z-50 w-[40px] min-w-[40px] border-r border-b border-base-200 px-1 py-4 font-black text-[9px] uppercase tracking-widest text-base-content/40 text-center shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]" title="Licencia/Vacaciones">L</th>
    `;
  }
  
  parsedDates.forEach(pd => {
    const thTitle = pd.feriadoName ? ` title="Feriado: ${pd.feriadoName}"` : '';
    const tooltipText = pd.feriadoName ? `Feriado: ${pd.feriadoName}` : `Ver detalle del día ${pd.dateNum} de ${pd.monthName}`;
    theadHtml += `
      <th class="${pd.thClass} p-0"${thTitle}>
        <button
          type="button"
          class="w-full h-full flex flex-col items-center justify-center py-2 gap-0.5 cursor-pointer hover:bg-base-content/5 active:bg-base-content/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 rounded-none border-0"
          data-click-day="${pd.str}"
          title="${tooltipText}"
          aria-label="${tooltipText}"
        >
          <span class="font-extrabold text-[10px] tracking-wide ${pd.isToday ? 'opacity-90' : 'opacity-60'}">${pd.dayName}</span>
          <div class="flex items-center gap-1">
             <span class="font-black text-xs ${pd.isToday ? 'scale-110' : ''}">${pd.dateNum}</span>
             ${pd.isCritical ? '<div class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></div>' : ''}
          </div>
          ${pd.isToday ? `<span class="text-[7px] font-black tracking-wide uppercase opacity-80">HOY</span>` : ''}
        </button>
      </th>
    `;
  });
  theadHtml += `</tr>`;
  if (thead) thead.innerHTML = theadHtml;

  let tbodyHtml = '';
  const filteredOps = state.cronoData.filter(op => {
    const matchesSearch = !state.searchQuery || op.nombre.toLowerCase().includes(state.searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (state.activeLocationFilter !== 'all' && (op.location || "Monte Grande") !== state.activeLocationFilter) {
      return false;
    }

    if (state.activeFilter === 'all') return true;
    
    return dates.some(d => {
      const status = op.asistencia[d];
      if (state.activeFilter === 'Licencia') {
        return status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones;
      }
      return status === state.activeFilter;
    });
  });

  const sortedOps = sortOperators(filteredOps, selectedDateStr);

  if (sortedOps.length === 0) {
    tbodyHtml = `<tr>
      <td colspan="${state.isTotalsCollapsed ? dates.length + 1 : dates.length + 4}" class="py-16 text-center text-base-content/40 font-bold bg-base-100/50 border border-dashed border-base-300/40">
        <div class="flex flex-col items-center justify-center gap-3 py-6">
          <div class="w-12 h-12 rounded-2xl bg-base-200/50 flex items-center justify-center text-base-content/30 border border-base-300/40">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-widest font-black text-base-content/70">Sin resultados</span>
            <span class="text-[10px] text-base-content/40 font-medium normal-case mt-0.5">Ningún operador coincide con tu búsqueda o filtro.</span>
          </div>
        </div>
      </td>
    </tr>`;
  } else {
    sortedOps.forEach(op => {
      const stats = { P: 0, HO: 0, L: 0 };
      const username = op.username || '';
      dates.forEach(d => {
        const s = op.asistencia[d];
        if (s === OperatorStatus.PresencialMonteGrande || s === OperatorStatus.PresencialParquePatricios) stats.P++;
        else if (s === OperatorStatus.HomeOffice) stats.HO++;
        else if (s === OperatorStatus.Licencia || s === OperatorStatus.Vacaciones) stats.L++;
      });

      // --- RULE: Consecutive HO Check & Min Presencial Check ---
      const opMaxHO = (op.maxConsecutiveHO !== undefined && op.maxConsecutiveHO !== null) ? op.maxConsecutiveHO : state.maxConsecutiveHOLimit;
      const opMinPWeek = (op.minPWeek !== undefined && op.minPWeek !== null) ? op.minPWeek : state.minPWeekLimit;

      let maxConsecutiveHO = 0;
      let currentHO = 0;
      
      let pWeekViolation = false;
      let currentWeekP = 0;
      let currentWeekDays = 0;

      parsedDates.forEach(pd => {
        const d = pd.str;
        const status = op.asistencia[d];
        if (status === OperatorStatus.HomeOffice) {
          currentHO++;
          maxConsecutiveHO = Math.max(maxConsecutiveHO, currentHO);
        } else if (status !== OperatorStatus.Franco && status) {
          currentHO = 0;
        }

        if (status === OperatorStatus.PresencialMonteGrande || status === OperatorStatus.PresencialParquePatricios) currentWeekP++;
        if (status !== OperatorStatus.Franco && status !== OperatorStatus.Licencia && status !== OperatorStatus.Vacaciones && status) {
           currentWeekDays++;
        }
        if (pd.day === 0 || d === dates[dates.length - 1]) {
           if (currentWeekDays >= 5 && currentWeekP < opMinPWeek) {
              pWeekViolation = true;
           }
           currentWeekP = 0;
           currentWeekDays = 0;
        }
      });
      
      const hoViolation = maxConsecutiveHO > opMaxHO;
      if (hoViolation || pWeekViolation) totalInconsistencies++;

      const opShadowClass = state.isTotalsCollapsed ? 'shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]' : '';

      tbodyHtml += `<tr class="group ${(hoViolation || pWeekViolation) ? 'bg-error/[0.02]' : ''}" data-op-name="${op.nombre.toLowerCase()}">
        <td class="sticky left-0 bg-base-100 z-30 w-[200px] min-w-[200px] font-bold py-3 px-6 text-xs border-r border-b border-base-200/70 group-hover:bg-base-200 transition-colors ${opShadowClass}">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full ${(hoViolation || pWeekViolation) ? 'bg-error animate-pulse' : 'bg-base-300 group-hover:bg-amber-500'} transition-all shadow-sm cursor-pointer hover:scale-125 hover:ring-2 hover:ring-secondary/50 op-row-dot ${state.isEditMode ? 'op-row-header' : ''}" title="${state.isEditMode ? 'Pintar toda la fila' : 'Destacar fila'}"></span>
            <div class="flex flex-col min-w-0 flex-1">
              <div class="flex items-center justify-between w-full">
                <button class="hover:text-secondary hover:underline underline-offset-2 transition-all text-left truncate font-bold text-xs" data-op-profile="${op.nombre}">
                  ${op.nombre}
                </button>
                <div class="flex items-center gap-0.5 shrink-0 ml-1.5 no-print ${state.isEditMode ? '' : 'hidden'}">
                  <button type="button" class="btn btn-ghost btn-square btn-xs w-5 h-5 text-base-content/50 hover:text-secondary edit-op-btn" data-edit-op-name="${escapeHtml(op.nombre)}" data-edit-op-username="${escapeHtml(username)}" data-edit-op-location="${escapeHtml(op.location || 'Monte Grande')}" data-edit-op-schedule="${escapeHtml(op.horario || '')}" title="Editar operador">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button type="button" class="btn btn-ghost btn-square btn-xs w-5 h-5 text-base-content/50 hover:text-error delete-op-btn" data-delete-op-name="${escapeHtml(op.nombre)}" title="Eliminar operador">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
              ${hoViolation ? `<span class="text-[9px] bg-error/10 border border-error/20 px-2 py-0.5 rounded-md font-black text-error uppercase tracking-wider mt-1 inline-block w-fit shadow-sm">⚠️ Exceso de HO (${maxConsecutiveHO}d)</span>` : ''}
              ${pWeekViolation ? `<span class="text-[9px] bg-error/10 border border-error/20 px-2 py-0.5 rounded-md font-black text-error uppercase tracking-wider mt-1 inline-block w-fit shadow-sm">⚠️ Faltan días P.</span>` : ''}
            </div>
          </div>
        </td>
      `;

      if (!state.isTotalsCollapsed) {
        tbodyHtml += `
          <td class="sticky left-[200px] bg-base-100 z-30 w-[40px] min-w-[40px] py-3 px-1 text-center text-[10px] font-black border-r border-b border-base-200/70 text-secondary group-hover:bg-base-200 transition-colors">${stats.P}</td>
          <td class="sticky left-[240px] bg-base-100 z-30 w-[40px] min-w-[40px] py-3 px-1 text-center text-[10px] font-black border-r border-b border-base-200/70 text-amber-600 dark:text-amber-400 group-hover:bg-base-200 transition-colors">${stats.HO}</td>
          <td class="sticky left-[280px] bg-base-100 z-30 w-[40px] min-w-[40px] py-3 px-1 text-center text-[10px] font-black border-r border-b border-base-200/70 text-error group-hover:bg-base-200 transition-colors shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">${stats.L}</td>
        `;
      }
        
      parsedDates.forEach(pd => {
        const date = pd.str;
        const { status, horario: dailyHorario } = resolveOperatorStatusAndHorario(op, date);
        const styles = getStatusStyles(status);
        const isTodayCell = pd.isToday;
        const safeName = escapeHtml(op.nombre);
        const safeDate = escapeHtml(date);
        const safeStatus = escapeHtml(status || 'Franco');
        const safeHorario = escapeHtml(dailyHorario);
        const username = op.username || '';

        const breakInicio = (op.breaks_inicio && op.breaks_inicio[date]) || '';
        const breakFin = (op.breaks_fin && op.breaks_fin[date]) || '';

        // --- RULE: License Overlap Check ---
        const isLicenseOverlap = (status === OperatorStatus.Licencia || status === OperatorStatus.Vacaciones) && coveragePerDay[date].licenses > state.maxLicenseOverlapLimit;
        if (isLicenseOverlap) totalInconsistencies++;

        const isFrancoCell = status === OperatorStatus.Franco || !status;
        let cellClass = `p-1 border-r border-b border-base-200/50 text-center transition-all duration-300`;
        if (isTodayCell) {
          cellClass += isFrancoCell ? ' bg-base-200/80 dark:bg-base-300/20' : ' bg-secondary/10';
        }
        if (isLicenseOverlap) cellClass += ' ring-1 ring-inset ring-error/30 bg-error/[0.03]';
        
        const isHoliday = isFeriado(date);
        if (isHoliday) cellClass += ' bg-orange-100 dark:bg-orange-950';
        
        const hasComment = !!(op.comentarios && op.comentarios[date]);
        const dayOvertime = (op.weekendOvertimes || []).find(s => s.date === date);
        const otAttr = dayOvertime ? `data-overtime="${escapeHtml(dayOvertime.startTime + ' - ' + dayOvertime.endTime)}"` : '';

        if (isFrancoCell) {
          let francoBtnClass = `monthly-cell-button h-12 flex flex-col items-center justify-center relative ${isTodayCell ? 'bg-base-300/40 border border-base-content/25' : 'bg-base-200/20 border border-base-300/20'}`;
          if (isHoliday) {
            francoBtnClass += " line-through opacity-60 !bg-orange-200/60 dark:!bg-orange-600/60 !border-orange-300 dark:!border-orange-500";
          }
          let francoAria = `Ver detalle de ${safeName} el ${safeDate}: Franco`;
          if (isHoliday && pd.feriadoName) {
            francoAria += ` (Feriado: ${pd.feriadoName})`;
          }

          tbodyHtml += `<td class="${cellClass}">
            <button
              type="button"
              class="${francoBtnClass}"
              data-monthly-detail
              data-operator="${safeName}"
              data-date="${safeDate}"
              data-status="Franco"
              data-horario="${safeHorario}"
              data-username="${escapeHtml(username)}"
              data-comment="${escapeHtml(op.comentarios?.[date] || '')}"
              data-break-inicio="${escapeHtml(breakInicio)}"
              data-break-fin="${escapeHtml(breakFin)}"
              aria-label="${francoAria}"
              ${otAttr}
              ${isHoliday && pd.feriadoName ? `title="Franco (Feriado: ${pd.feriadoName})"` : ''}
            >
              ${dayOvertime ? `<span class="text-[8px] font-black text-base-content bg-warning/25 border border-warning/40 px-1 py-0.5 rounded tracking-tight">HE: ${dayOvertime.startTime}</span>` : ''}
              ${hasComment ? `<div class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse ${dayOvertime ? 'mt-0.5' : ''}" title="Tiene comentario"></div>` : ''}
            </button>
          </td>`;
          return;
        }

        let initials = "";
        if (status === OperatorStatus.PresencialMonteGrande) initials = "MG";
        else if (status === OperatorStatus.PresencialParquePatricios) initials = "PP";
        else if (status === OperatorStatus.HomeOffice) initials = "HO";
        else if (status === OperatorStatus.Licencia) initials = "L";
        else if (status === OperatorStatus.Vacaciones) initials = "V";

        let statusBtnClass = `monthly-cell-button h-12 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer hover:scale-110 hover:z-10 relative border ${isTodayCell ? 'border-secondary/40 ring-1 ring-secondary/30 shadow-[0_0_10px_rgba(37,72,136,0.1)]' : 'border-base-300/30'} ${styles.bgClass} shadow-sm hover:shadow-lg ${isLicenseOverlap ? 'border-error/40' : ''}`;
        
        const dateObj = new Date(date + "T12:00:00");
        const isSaturday = dateObj.getDay() === 6;
        const activeGroup = getActiveGroupForDate(date);
        const isRotationCell = !!(isSaturday && op.saturdayGroup && op.saturdayGroup === activeGroup && !(op.overrides && op.overrides[date]));
        
        if (isRotationCell) {
          statusBtnClass += ' ring-1 ring-inset ring-secondary/35 border-secondary/40 hover:ring-secondary/50';
        }

        if (isHoliday) {
          statusBtnClass += " line-through opacity-60 !bg-orange-200 dark:!bg-orange-600 !text-orange-800 dark:!text-orange-100 !border-orange-300 dark:!border-orange-500 !shadow-none";
        }

        let statusTitle = `${op.nombre} - ${date}: ${status} ${isLicenseOverlap ? '(Solapamiento Crítico)' : ''}`;
        if (isRotationCell) {
          statusTitle += ` (Rotación Sábado Grupo ${op.saturdayGroup})`;
        }
        let statusAria = `Ver detalle de ${safeName} el ${safeDate}: ${safeStatus}`;
        if (isHoliday && pd.feriadoName) {
          statusTitle += ` (Feriado: ${pd.feriadoName})`;
          statusAria += ` (Feriado: ${pd.feriadoName})`;
        }

        tbodyHtml += `
          <td class="${cellClass}">
            <button
              type="button"
              class="${statusBtnClass}"
              title="${statusTitle}"
              data-monthly-detail
              data-operator="${safeName}"
              data-date="${safeDate}"
              data-status="${safeStatus}"
              data-horario="${safeHorario}"
              data-username="${escapeHtml(username)}"
              data-comment="${escapeHtml(op.comentarios?.[date] || '')}"
              data-break-inicio="${escapeHtml(breakInicio)}"
              data-break-fin="${escapeHtml(breakFin)}"
              aria-label="${statusAria}"
              ${otAttr}
              ${isRotationCell ? `data-saturday-rotation="true" data-rotation-horario="${escapeHtml(op.saturdayHorario || '07:00 - 13:00')}"` : ''}
            >
              <span class="font-black text-xs leading-none tracking-tight">${initials}</span>
              ${dayOvertime ? `<span class="text-[8px] font-black text-base-content bg-warning/25 border border-warning/40 px-1 py-0.5 rounded tracking-tight mt-0.5 scale-90">HE: ${dayOvertime.startTime}</span>` : ''}
              ${isLicenseOverlap ? '<div class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error border border-base-100"></div>' : ''}
              ${hasComment ? `<div class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-base-100" title="Tiene comentario"></div>` : ''}
              ${isRotationCell ? '<div class="absolute bottom-1.5 w-1 h-1 rounded-full bg-secondary"></div>' : ''}
            </button>
          </td>
        `;
      });
      tbodyHtml += `</tr>`;
    });
  }

  if (tbody) tbody.innerHTML = tbodyHtml;



  // --- FEATURE: Coverage Visualizer (Heatmap Footer) ---
  const dailyCoverage = dates.map(date => {
    let pmg = 0, ppp = 0, ho = 0;
    state.cronoData.forEach(op => {
      const s = op.asistencia[date];
      if (s === OperatorStatus.PresencialMonteGrande) pmg++;
      else if (s === OperatorStatus.PresencialParquePatricios) ppp++;
      else if (s === OperatorStatus.HomeOffice) ho++;
    });
    return { pmg, ppp, ho, total: pmg + ppp + ho };
  });

  const pyClass = state.isCoverageMinimized ? 'py-1.5' : 'py-3.5';
  const chevronIcon = state.isCoverageMinimized ? 
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up transition-transform duration-200"><path d="m18 15-6-6-6 6"/></svg>` : 
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down transition-transform duration-200"><path d="m6 9 6 6 6-6"/></svg>`;

  const shadowClass = state.isTotalsCollapsed ? 'shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]' : '';

  let tfootHtml = `<tr>
    <td class="sticky left-0 bg-base-200 z-50 w-[200px] min-w-[200px] ${pyClass} px-6 border-r border-base-300 ${shadowClass}">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] font-black uppercase tracking-[0.1em] text-base-content/60">Resumen Cobertura</span>
        <button
          type="button"
          id="toggle-coverage-btn"
          class="btn btn-xs btn-ghost p-0.5 rounded hover:bg-base-300 text-base-content/50 hover:text-base-content transition-all"
          title="${state.isCoverageMinimized ? 'Maximizar resumen de cobertura' : 'Minimizar resumen de cobertura'}"
          aria-label="${state.isCoverageMinimized ? 'Maximizar resumen de cobertura' : 'Minimizar resumen de cobertura'}"
        >
          ${chevronIcon}
        </button>
      </div>
    </td>
  `;

  if (!state.isTotalsCollapsed) {
    tfootHtml += `
      <td class="sticky left-[200px] bg-base-200 z-50 w-[40px] min-w-[40px] text-center ${pyClass} text-[10px] font-black border-r border-base-300 text-base-content/40" title="Total Operadores">${teamSize}</td>
      <td class="sticky left-[240px] bg-base-200 z-50 w-[40px] min-w-[40px] text-center ${pyClass} text-[10px] font-black border-r border-base-300 text-base-content/20">-</td>
      <td class="sticky left-[280px] bg-base-200 z-50 w-[40px] min-w-[40px] text-center ${pyClass} text-[10px] font-black border-r border-base-300 text-base-content/20 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]">-</td>
    `;
  }

  dailyCoverage.forEach(c => {
    const hoPercent = teamSize > 0 ? (c.ho / teamSize) * 100 : 0;
    const pmgPercent = teamSize > 0 ? (c.pmg / teamSize) * 100 : 0;
    const pppPercent = teamSize > 0 ? (c.ppp / teamSize) * 100 : 0;
    const totalPercent = teamSize > 0 ? ((c.pmg + c.ppp + c.ho) / teamSize) * 100 : 0;
    const isLowCoverage = totalPercent < 40;

    const cellPyClass = state.isCoverageMinimized ? 'py-1 px-1' : 'py-2 px-1';

    tfootHtml += `
      <td class="${cellPyClass} border-r border-base-200/50 min-w-[4rem] ${isLowCoverage ? 'bg-error/5' : ''}">
        <div class="flex flex-col items-center gap-1.5">
           ${state.isCoverageMinimized ? '' : `
           <div class="flex flex-col w-2.5 h-12 bg-base-300/30 rounded-full overflow-hidden justify-end shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
              <div class="bg-purple-500 w-full transition-all duration-500" style="height: ${pppPercent}%" title="P. Parque Patricios: ${c.ppp}"></div>
              <div class="bg-amber-500 w-full transition-all duration-500" style="height: ${pmgPercent}%" title="P. Monte Grande: ${c.pmg}"></div>
              <div class="bg-secondary w-full transition-all duration-500" style="height: ${hoPercent}%" title="HO: ${c.ho}"></div>
           </div>
           `}
           <div class="flex flex-col items-center leading-none">
              <span class="text-[10px] font-black ${isLowCoverage ? 'text-error' : 'text-base-content/60'}">${c.pmg + c.ppp + c.ho}</span>
              <span class="text-[7px] font-black uppercase opacity-30">Activos</span>
           </div>
        </div>
      </td>
    `;
  });
  tfootHtml += `</tr>`;

  const tfoot = document.getElementById('monthly-tfoot');
  if (tfoot) tfoot.innerHTML = tfootHtml;
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
        newStatus !== OperatorStatus.Franco) {
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

async function saveChangesToServer(): Promise<void> {
  const saveBtn = document.getElementById('save-confirm-btn') as HTMLButtonElement | null;
  const discardBtn = document.getElementById('save-discard-btn') as HTMLButtonElement | null;
  const indicatorText = document.getElementById('save-indicator-text');

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Guardando...`;
  }
  if (discardBtn) discardBtn.disabled = true;

  try {
    const payload = state.modifiedSchedules.map(m => ({ agentName: m.agentName, date: m.date, status: m.status }));
    await saveEdits(payload);

    if (indicatorText) {
      indicatorText.innerText = "¡Cambios guardados con éxito!";
    }

    state.modifiedSchedules = [];
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const currentMonth = dateInput?.value ? dateInput.value.slice(0, 7) : undefined;
    const data = await fetchCronogramaData(currentMonth);
    state.cronoData = data;

    setTimeout(() => {
      const saveIndicator = document.getElementById('save-indicator');
      if (saveIndicator) saveIndicator.classList.add('hidden');
      
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = "Guardar";
      }
      if (discardBtn) discardBtn.disabled = false;
      
      if (indicatorText) {
        indicatorText.innerText = "Edición en progreso: Cambios pendientes";
      }

      renderDaily();
      renderMonthly();
      showToast("Cambios guardados con éxito", "success");
    }, 1500);

  } catch (error: unknown) {
    console.error("Error saving changes:", error);
    if (indicatorText) {
      indicatorText.innerText = "Error al guardar en el servidor";
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = "Reintentar";
    }
    if (discardBtn) discardBtn.disabled = false;
    showToast("Error al guardar cambios", "error");
  }
}

function updateViewSwitcherUI(activeView: 'monthly' | 'daily' | 'groups' | 'overtime' | 'pasiva'): void {
  const switchToMonthlyBtn = document.getElementById('switch-to-monthly-btn');
  const switchToDailyBtn = document.getElementById('switch-to-daily-btn');
  const switchToGroupsBtn = document.getElementById('switch-to-groups-btn');
  const switchToOvertimeBtn = document.getElementById('switch-to-overtime-btn');
  const switchToPasivaBtn = document.getElementById('switch-to-pasiva-btn');
  
  const activeClasses = ['btn-secondary', 'shadow-sm', 'shadow-secondary/15'];
  const inactiveClasses = ['btn-outline', 'border-transparent', 'text-base-content/60', 'hover:bg-base-200/50'];
  
  [switchToMonthlyBtn, switchToDailyBtn, switchToGroupsBtn, switchToOvertimeBtn, switchToPasivaBtn].forEach(btn => {
    btn?.classList.remove(...activeClasses);
    btn?.classList.remove(...inactiveClasses);
  });

  if (activeView === 'monthly') {
    switchToMonthlyBtn?.classList.add(...activeClasses);
    [switchToDailyBtn, switchToGroupsBtn, switchToOvertimeBtn, switchToPasivaBtn].forEach(b => b?.classList.add(...inactiveClasses));
  } else if (activeView === 'daily') {
    switchToDailyBtn?.classList.add(...activeClasses);
    [switchToMonthlyBtn, switchToGroupsBtn, switchToOvertimeBtn, switchToPasivaBtn].forEach(b => b?.classList.add(...inactiveClasses));
  } else if (activeView === 'groups') {
    switchToGroupsBtn?.classList.add(...activeClasses);
    [switchToMonthlyBtn, switchToDailyBtn, switchToOvertimeBtn, switchToPasivaBtn].forEach(b => b?.classList.add(...inactiveClasses));
  } else if (activeView === 'overtime') {
    switchToOvertimeBtn?.classList.add(...activeClasses);
    [switchToMonthlyBtn, switchToDailyBtn, switchToGroupsBtn, switchToPasivaBtn].forEach(b => b?.classList.add(...inactiveClasses));
  } else {
    switchToPasivaBtn?.classList.add(...activeClasses);
    [switchToMonthlyBtn, switchToDailyBtn, switchToGroupsBtn, switchToOvertimeBtn].forEach(b => b?.classList.add(...inactiveClasses));
  }

  // Hide toolbars if we switch away from their respective views
  const editToolbar = document.getElementById('edit-mode-toolbar');
  const pasivaToolbar = document.getElementById('pasiva-edit-toolbar');
  if (editToolbar && activeView !== 'monthly' && activeView !== 'daily') {
    editToolbar.classList.add('opacity-0', 'pointer-events-none', 'translate-y-32');
  }
  if (pasivaToolbar && activeView !== 'pasiva') {
    pasivaToolbar.classList.add('opacity-0', 'pointer-events-none', 'translate-y-32');
  }
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
  
  updateViewSwitcherUI('monthly');
  
  if (dailyView) dailyView.classList.add('hidden');
  if (monthlyView) monthlyView.classList.remove('hidden');
  if (groupsView) groupsView.classList.add('hidden');
  if (overtimeView) overtimeView.classList.add('hidden');
  if (pasivaView) pasivaView.classList.add('hidden');
  
  if (datePickerContainer) {
    datePickerContainer.classList.add('is-faded');
    setTimeout(() => {
      datePickerContainer.classList.add('hidden');
    }, 300);
  }
}

function showGroupsView(): void {
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

async function renderGroupsView(): Promise<void> {
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

    activeRotationConfig = { startDate: config.startDate, startGroup: config.startGroup, rotationOrder: config.rotationOrder };
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
                  <span class="text-[9px] font-semibold text-base-content/50 truncate">${escapeHtml(agent.saturdayHorario || '07:00 - 13:00')}</span>
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
      const [y, m] = activeDateStr.split('-').map(Number);
      let firstSat = 1;
      for (let d = 1; d <= 7; d++) {
        const dayVal = new Date(y, m - 1, d).getDay();
        if (dayVal === 6) {
          firstSat = d;
          break;
        }
      }
      rotationTimelineSelectedDate = `${y}-${String(m).padStart(2, '0')}-${String(firstSat).padStart(2, '0')}`;
    }

    const rotationTimelineInput = document.getElementById('rotation-timeline-date') as HTMLInputElement | null;
    if (rotationTimelineInput) {
      rotationTimelineInput.value = rotationTimelineSelectedDate;
      const displayEl = document.getElementById('rotation-timeline-date-display');
      if (displayEl) {
        displayEl.textContent = formatToDDMMYY(rotationTimelineSelectedDate);
      }
    }
    renderRotationTimeline(rotationTimelineSelectedDate);

  } catch (err: any) {
    console.error("renderGroupsView Error:", err);
    showToast("Error al renderizar vista de grupos", "error");
  }
}

function renderRotationTimeline(dateStr: string): void {
  const tableBody = document.getElementById('rotation-timeline-body');
  const groupDisplay = document.getElementById('rotation-active-group-display');
  if (!tableBody) return;

  const activeGroup = getActiveGroupForDate(dateStr);
  if (groupDisplay) {
    groupDisplay.textContent = activeGroup ? `Grupo ${activeGroup}` : 'Sin grupo';
    if (activeGroup) {
      const displayBorderClasses: Record<string, string> = {
        A: 'bg-success/10 border-success/20 text-success',
        B: 'bg-error/10 border-error/20 text-error',
        C: 'bg-warning/10 border-warning/20 text-warning',
        D: 'bg-info/10 border-info/20 text-info'
      };
      groupDisplay.className = `flex h-8 items-center px-3 py-1.5 rounded-lg border font-bold text-xs shadow-sm select-none ${displayBorderClasses[activeGroup] || 'bg-secondary/10 border-secondary/20 text-secondary'}`;
    }
  }

  if (!activeGroup) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-xs text-base-content/30 font-bold uppercase tracking-wider">
          Configura una rotación válida primero
        </td>
      </tr>
    `;
    return;
  }

  const groupOps = state.cronoData.filter(op => op.saturdayGroup === activeGroup);

  if (groupOps.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-xs text-base-content/30 font-bold uppercase tracking-wider">
          No hay operadores asignados al Grupo ${activeGroup}
        </td>
      </tr>
    `;
    return;
  }

  groupOps.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const hours = [7, 8, 9, 10, 11, 12];
  
  const groupBgClasses: Record<string, string> = {
    A: 'bg-success/10',
    B: 'bg-error/10',
    C: 'bg-warning/10',
    D: 'bg-info/10'
  };
  const groupBadgeClasses: Record<string, string> = {
    A: 'bg-success text-white',
    B: 'bg-error text-white',
    C: 'bg-warning text-warning-content',
    D: 'bg-info text-white'
  };

  const cellBgClass = groupBgClasses[activeGroup] || 'bg-emerald-500/10';
  const badgeClass = groupBadgeClasses[activeGroup] || 'bg-emerald-500 text-white';

  tableBody.innerHTML = groupOps.map(op => {
    const initials = op.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
    const horario = op.saturdayHorario || '07:00 - 13:00';
    
    const attendanceStatus = op.asistencia?.[dateStr];
    const isExcused = op.overrides?.[dateStr] && 
      (attendanceStatus === OperatorStatus.Franco || 
       attendanceStatus === OperatorStatus.Licencia || 
       attendanceStatus === OperatorStatus.Vacaciones);

    const hourCells = hours.map((h, i) => {
      const isWorking = !isExcused && isHourCoveredBySchedule(horario, h);
      const isLast = i === hours.length - 1;
      
      const borderClass = isLast ? '' : 'border-r border-base-300/40';

      if (isWorking) {
        return `
          <td class="p-2 text-center ${borderClass} ${cellBgClass}">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-md ${badgeClass} font-black text-xs shadow-sm">
              ${activeGroup}
            </span>
          </td>
        `;
      } else {
        return `
          <td class="p-2 text-center ${borderClass} bg-base-100/10 text-base-content/10">
            -
          </td>
        `;
      }
    }).join('');

    return `
      <tr class="hover:bg-base-200/30 transition-colors">
        <td class="px-3 py-3 border-r border-base-300/40 flex items-center gap-2.5">
          <div class="w-6.5 h-6.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20 flex items-center justify-center text-[9px] font-black shrink-0">
            ${initials}
          </div>
          <div class="flex flex-col min-w-0">
            <span class="truncate text-[11px] font-bold text-base-content">${escapeHtml(op.nombre)}</span>
            <span class="text-[9px] font-semibold text-base-content/40 leading-tight">${horario}</span>
          </div>
        </td>
        ${hourCells}
      </tr>
    `;
  }).join('');
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

  const buttons = [
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

  updateButtonGroupState(buttons, state.activeFilter, STATUS_FILTER_CONFIGS.monthly);
  updateButtonGroupState(dailyButtons, state.activeFilter, STATUS_FILTER_CONFIGS.daily);
}

function updateLocationFilterActiveStates(): void {
  const filterLocationAllBtn = document.getElementById('filter-location-all-btn');
  const filterLocationMgBtn = document.getElementById('filter-location-mg-btn');
  const filterLocationPpBtn = document.getElementById('filter-location-pp-btn');

  const filterLocationAllBtnDaily = document.getElementById('filter-location-all-btn-daily');
  const filterLocationMgBtnDaily = document.getElementById('filter-location-mg-btn-daily');
  const filterLocationPpBtnDaily = document.getElementById('filter-location-pp-btn-daily');

  const buttons = [
    { el: filterLocationAllBtn, value: 'all' },
    { el: filterLocationMgBtn, value: 'Monte Grande' },
    { el: filterLocationPpBtn, value: 'Parque Patricios' }
  ];

  const dailyButtons = [
    { el: filterLocationAllBtnDaily, value: 'all' },
    { el: filterLocationMgBtnDaily, value: 'Monte Grande' },
    { el: filterLocationPpBtnDaily, value: 'Parque Patricios' }
  ];

  updateButtonGroupState(buttons, state.activeLocationFilter, LOCATION_FILTER_CONFIG);
  updateButtonGroupState(dailyButtons, state.activeLocationFilter, LOCATION_FILTER_CONFIG);
}

function applyBrushToCell(cell: HTMLElement): void {
  const opName = cell.dataset.operator;
  const dateVal = cell.dataset.date;
  const currentStatus = cell.dataset.status;
  
  if (dateVal && isWeekend(dateVal)) {
    if (state.activeBrush !== OperatorStatus.Licencia &&
        state.activeBrush !== OperatorStatus.Vacaciones &&
        state.activeBrush !== OperatorStatus.Franco) {
      return;
    }
  }

  if (!opName || !dateVal || !state.activeBrush || currentStatus === state.activeBrush) return;

  const key = `${opName}_${dateVal}`;
  if (!state.pendingEdits[key]) {
    state.pendingEdits[key] = { agentName: opName, date: dateVal, status: state.activeBrush, originalStatus: currentStatus || '' };
  } else {
    state.pendingEdits[key].status = state.activeBrush;
    if (state.pendingEdits[key].status === state.pendingEdits[key].originalStatus) {
       delete state.pendingEdits[key];
    }
  }

  const op = state.cronoData.find(o => o.nombre === opName);
  if (op) {
     op.asistencia[dateVal] = state.activeBrush as OperatorStatus;
     updateOperatorDailyHorario(op, dateVal, state.activeBrush);
  }
  
  updatePendingEditsUI();
  renderMonthly(); 
}

function updateBrushUI(): void {
  document.querySelectorAll('.brush-btn').forEach(btn => {
    const activeClasses = (btn as HTMLElement).dataset.activeClass?.split(' ') || [];
    if ((btn as HTMLElement).dataset.brush === state.activeBrush) {
      btn.classList.remove('opacity-50', 'btn-ghost');
      btn.classList.add('scale-110', 'font-black', ...activeClasses);
    } else {
      btn.classList.add('opacity-50', 'btn-ghost');
      btn.classList.remove('scale-110', 'font-black', ...activeClasses);
    }
  });
}

function updateMaximizeUI(isMax: boolean): void {
  const htmlEl = document.documentElement;
  
  const maxBtn = document.getElementById('maximize-cronograma-btn');
  const maxIcon = maxBtn?.querySelector('.max-icon');
  const minIcon = maxBtn?.querySelector('.min-icon');
  const maxText = document.getElementById('maximize-text');

  const maxBtnDaily = document.getElementById('maximize-cronograma-btn-daily');
  const maxIconDaily = maxBtnDaily?.querySelector('.max-icon');
  const minIconDaily = maxBtnDaily?.querySelector('.min-icon');
  const maxTextDaily = document.getElementById('maximize-text-daily');
  
  if (isMax) {
    htmlEl.classList.add('cronograma-maximized');
    
    maxIcon?.classList.add('hidden');
    minIcon?.classList.remove('hidden');
    if (maxText) maxText.innerText = "Restaurar";
    maxBtn?.setAttribute('title', 'Restaurar cronograma');
    maxBtn?.setAttribute('aria-label', 'Restaurar cronograma');

    maxIconDaily?.classList.add('hidden');
    minIconDaily?.classList.remove('hidden');
    if (maxTextDaily) maxTextDaily.innerText = "Restaurar";
    maxBtnDaily?.setAttribute('title', 'Restaurar cronograma');
    maxBtnDaily?.setAttribute('aria-label', 'Restaurar cronograma');
  } else {
    htmlEl.classList.remove('cronograma-maximized');
    
    maxIcon?.classList.remove('hidden');
    minIcon?.classList.add('hidden');
    if (maxText) maxText.innerText = "Maximizar";
    maxBtn?.setAttribute('title', 'Maximizar cronograma');
    maxBtn?.setAttribute('aria-label', 'Maximizar cronograma');

    maxIconDaily?.classList.remove('hidden');
    minIconDaily?.classList.add('hidden');
    if (maxTextDaily) maxTextDaily.innerText = "Maximizar";
    maxBtnDaily?.setAttribute('title', 'Maximizar cronograma');
    maxBtnDaily?.setAttribute('aria-label', 'Maximizar cronograma');
  }
}

function setupEventListeners(): void {
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

  const monthlySort = document.getElementById('monthly-sort') as HTMLSelectElement | null;
  const dailySort = document.getElementById('daily-sort') as HTMLSelectElement | null;

  if (monthlySort) monthlySort.value = state.activeSort;
  if (dailySort) dailySort.value = state.activeSort;

  const handleSortChange = (e: Event) => {
    const val = (e.target as HTMLSelectElement).value;
    state.activeSort = val;
    if (monthlySort && monthlySort !== e.target) monthlySort.value = val;
    if (dailySort && dailySort !== e.target) dailySort.value = val;
    renderMonthly();
    renderDaily();
  };

  monthlySort?.addEventListener('change', handleSortChange);
  dailySort?.addEventListener('change', handleSortChange);

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
          if (status === 'Licencia' || status === 'Vacaciones' || status === 'Franco') {
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
      try {
        const rotRes = await fetch(`/api/cronograma/rotation-config?month=${activeYM}`);
        if (rotRes.ok) {
          activeRotationConfig = await rotRes.json();
        }
      } catch (err) {
        console.warn("Failed to load rotation config:", err);
      }

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

  const importBtn = document.getElementById('import-csv-btn');
  const importInput = document.getElementById('import-csv-input') as HTMLInputElement | null;
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleImportCSV);
  }

  // --- Maximize Mode Handler ---
  const maxBtn = document.getElementById('maximize-cronograma-btn');
  const maxBtnDaily = document.getElementById('maximize-cronograma-btn-daily');

  const handleMaximizeClick = () => {
    const isMax = !document.documentElement.classList.contains('cronograma-maximized');
    safeSetItem('cronoMaximized', isMax ? 'true' : 'false');
    updateMaximizeUI(isMax);
  };

  maxBtn?.addEventListener('click', handleMaximizeClick);
  maxBtnDaily?.addEventListener('click', handleMaximizeClick);

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
      activeRotationConfig = { startDate, startGroup, rotationOrder };
      
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
}

// ===================================================
// OVERTIME VIEW FUNCTIONS
// ===================================================

function showOvertimeView(): void {
  const dailyView = document.getElementById('daily-view');
  const monthlyView = document.getElementById('monthly-view');
  const groupsView = document.getElementById('groups-view');
  const overtimeView = document.getElementById('overtime-view');
  const pasivaView = document.getElementById('pasiva-view');
  const datePickerContainer = document.getElementById('date-picker-container');

  updateViewSwitcherUI('overtime');

  if (dailyView) dailyView.classList.add('hidden');
  if (monthlyView) monthlyView.classList.add('hidden');
  if (groupsView) groupsView.classList.add('hidden');
  if (overtimeView) overtimeView.classList.remove('hidden');
  if (pasivaView) pasivaView.classList.add('hidden');

  if (datePickerContainer) {
    datePickerContainer.classList.add('is-faded');
    setTimeout(() => {
      datePickerContainer.classList.add('hidden');
    }, 300);
  }

  renderOvertimeView();
}

function renderOvertimeView(): void {
  const referenteSelect = document.getElementById('overtime-referente-select') as HTMLSelectElement | null;
  const shiftAgentSelect = document.getElementById('overtime-shift-agent') as HTMLSelectElement | null;

  if (referenteSelect) {
    const currentVal = referenteSelect.value;
    referenteSelect.innerHTML = '<option value="">Sin asignar</option>';
    state.cronoData.forEach(op => {
      const opt = document.createElement('option');
      opt.value = op.nombre;
      opt.textContent = op.nombre;
      referenteSelect.appendChild(opt);
    });
    if (currentVal) referenteSelect.value = currentVal;
  }

  if (shiftAgentSelect) {
    const currentVal = shiftAgentSelect.value;
    shiftAgentSelect.innerHTML = '<option value="">Seleccionar operador...</option>';
    state.cronoData.forEach(op => {
      const opt = document.createElement('option');
      opt.value = String(op.id ?? '');
      opt.textContent = op.nombre;
      shiftAgentSelect.appendChild(opt);
    });
    if (currentVal) shiftAgentSelect.value = currentVal;
  }

  if (overtimeSelectedWeekend) {
    refreshOvertimeForWeekend(overtimeSelectedWeekend);
  }
}

async function refreshOvertimeForWeekend(weekendDate: string): Promise<void> {
  overtimeSelectedWeekend = weekendDate;

  const existingConfig = overtimeConfigs.find(c => c.weekendStartDate === weekendDate);
  const referenteSelect = document.getElementById('overtime-referente-select') as HTMLSelectElement | null;
  if (referenteSelect) {
    referenteSelect.value = existingConfig ? existingConfig.referente : '';
  }

  try {
    const res = await fetch(`/api/cronograma/overtime/shifts?weekendStartDate=${weekendDate}`);
    if (!res.ok) throw new Error('Error al cargar turnos');
    const shifts: WeekendOvertimeShift[] = await res.json();
    
    // Update local state.cronoData so shifts reflect on other views instantly
    state.cronoData.forEach(op => {
      const otherWeekends = (op.weekendOvertimes || []).filter(s => s.weekendStartDate !== weekendDate);
      const currentWeekShifts = shifts.filter(s => s.agentId === op.id);
      op.weekendOvertimes = [...otherWeekends, ...currentWeekShifts];
    });

    renderOvertimeTimeline(weekendDate, shifts);
    renderOvertimeShiftsList(weekendDate, shifts);
  } catch (err) {
    console.error('Error loading overtime shifts:', err);
  }
}

function renderOvertimeTimeline(weekendDate: string, shifts: WeekendOvertimeShift[]): void {
  const hoursContainer = document.getElementById('overtime-timeline-hours');
  const bodyContainer = document.getElementById('overtime-timeline-body');
  const placeholder = document.getElementById('overtime-timeline-placeholder');

  if (!hoursContainer || !bodyContainer) return;
  if (placeholder) placeholder.classList.add('hidden');

  // Timeline: Sat 13:00 → Sun 23:59 = 35h = 2100 min
  const TIMELINE_START_MIN = 13 * 60;
  const TOTAL_MINUTES = 11 * 60 + 24 * 60;

  const hours: string[] = [];
  for (let h = 13; h < 24; h++) hours.push(`${String(h).padStart(2, '0')}:00`);
  for (let h = 0; h < 24; h++) hours.push(`${String(h).padStart(2, '0')}:00`);

  const sundayDateObj = new Date(weekendDate + 'T12:00:00');
  sundayDateObj.setDate(sundayDateObj.getDate() + 1);
  const sundayDate = `${sundayDateObj.getFullYear()}-${String(sundayDateObj.getMonth()+1).padStart(2,'0')}-${String(sundayDateObj.getDate()).padStart(2,'0')}`;

  const satWidthPct = (11 * 60 / TOTAL_MINUTES) * 100;
  const sunWidthPct = 100 - satWidthPct;

  hoursContainer.innerHTML = `
    <div class="flex flex-col flex-1">
      <div class="flex border-b border-base-300/60">
        <div style="width: ${satWidthPct.toFixed(2)}%" class="text-[8px] font-black uppercase tracking-wider text-warning/80 border-r border-base-300/50 py-1 px-2 bg-warning/5">Sábado (tarde)</div>
        <div style="width: ${sunWidthPct.toFixed(2)}%" class="text-[8px] font-black uppercase tracking-wider text-info/80 py-1 px-2 bg-info/5">Domingo</div>
      </div>
      <div class="flex">
        ${hours.map((h, i) => {
          const wp = (60 / TOTAL_MINUTES) * 100;
          const isMidnight = h === '00:00' && i > 0;
          return `<div style="width:${wp.toFixed(2)}%" class="text-[7px] font-bold text-base-content/40 border-r border-base-300/30 py-1 px-1 shrink-0 ${isMidnight ? 'bg-info/5 text-info/60 font-black border-info/30' : ''}">${h}</div>`;
        }).join('')}
      </div>
    </div>
  `;

  const toMinSinceStart = (dateStr: string, timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    const mins = h * 60 + m;
    return dateStr === weekendDate ? mins - TIMELINE_START_MIN : 11 * 60 + mins;
  };

  const activeOps = state.cronoData.filter(op => shifts.some(s => s.agentId === op.id));
  
  if (activeOps.length === 0) {
    bodyContainer.innerHTML = `
      <div class="flex items-center justify-center py-12 text-base-content/30 text-xs font-bold uppercase tracking-wider gap-2">
        <svg class="w-5 h-5 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        No hay turnos de horas extras asignados para este fin de semana
      </div>`;
    return;
  }

  bodyContainer.innerHTML = activeOps.map(op => {
    const opShifts = shifts.filter(s => s.agentId === op.id);
    const initials = op.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
    const shiftBars = opShifts.map(s => {
      const startMin = toMinSinceStart(s.date, s.startTime);
      const endMin = toMinSinceStart(s.date, s.endTime);
      if (startMin < 0 || endMin <= startMin) return '';
      const lp = (startMin / TOTAL_MINUTES) * 100;
      const wp = ((endMin - startMin) / TOTAL_MINUTES) * 100;
      return `<div class="absolute top-1 bottom-1 rounded bg-warning/80 border border-warning flex items-center justify-center overflow-hidden cursor-pointer hover:bg-warning/95 overtime-timeline-bar" style="left:${lp.toFixed(2)}%;width:${wp.toFixed(2)}%;min-width:4px;" title="${escapeHtml(op.nombre)}: ${s.startTime}-${s.endTime}" data-shift-id="${s.id}" data-agent-id="${s.agentId}" data-date="${s.date}" data-start="${s.startTime}" data-end="${s.endTime}"><span class="text-[8px] font-black text-warning-content truncate px-1">${s.startTime}-${s.endTime}</span></div>`;
    }).join('');
    return `
      <div class="flex items-stretch min-h-[40px] border-b border-base-300/30 last:border-0">
        <div class="w-36 shrink-0 px-3 py-2 border-r border-base-300/40 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-base-300/50 flex items-center justify-center text-[9px] font-black shrink-0">${initials}</div>
          <span class="truncate text-[10px] font-bold text-base-content">${escapeHtml(op.nombre)}</span>
        </div>
        <div class="flex-1 relative bg-base-100">
          ${shiftBars}
        </div>
      </div>`;
  }).join('');

  bodyContainer.querySelectorAll('.overtime-timeline-bar').forEach(bar => {
    bar.addEventListener('click', (e) => {
      const dataset = (e.currentTarget as HTMLElement).dataset;
      loadShiftIntoForm({
        id: Number(dataset.shiftId),
        agentId: Number(dataset.agentId),
        date: String(dataset.date),
        startTime: String(dataset.start),
        endTime: String(dataset.end)
      }, weekendDate);
    });
  });
}

function loadShiftIntoForm(shift: { id: number; agentId: number; date: string; startTime: string; endTime: string }, weekendDate: string): void {
  const agentSelect = document.getElementById('overtime-shift-agent') as HTMLSelectElement | null;
  const daySelect = document.getElementById('overtime-shift-day') as HTMLSelectElement | null;
  const startInput = document.getElementById('overtime-shift-start') as HTMLInputElement | null;
  const endInput = document.getElementById('overtime-shift-end') as HTMLInputElement | null;
  const editIdInput = document.getElementById('overtime-shift-edit-id') as HTMLInputElement | null;
  const submitBtn = document.getElementById('overtime-shift-submit-btn');
  const cancelBtn = document.getElementById('overtime-shift-cancel-btn');

  if (agentSelect) agentSelect.value = String(shift.agentId);
  if (daySelect) daySelect.value = shift.date === weekendDate ? 'saturday' : 'sunday';
  if (startInput) startInput.value = shift.startTime;
  if (endInput) endInput.value = shift.endTime;
  if (editIdInput) editIdInput.value = String(shift.id);

  if (submitBtn) submitBtn.textContent = 'Actualizar Turno';
  if (cancelBtn) cancelBtn.classList.remove('hidden');
}

function renderOvertimeShiftsList(weekendDate: string, shifts: WeekendOvertimeShift[]): void {
  const container = document.getElementById('overtime-shifts-list');
  if (!container) return;

  if (shifts.length === 0) {
    container.innerHTML = `<div class="text-xs text-base-content/30 text-center py-6 font-bold uppercase tracking-wider">No hay turnos guardados para este fin de semana</div>`;
    return;
  }

  container.innerHTML = shifts.map(s => {
    const op = state.cronoData.find(o => o.id === s.agentId);
    const dayLabel = s.date === weekendDate ? 'Sábado' : 'Domingo';
    const dayBadgeClass = s.date === weekendDate ? 'badge-warning' : 'badge-info';
    return `
      <div class="flex items-center gap-3 p-3 bg-base-200/40 rounded-xl border border-base-300/60 group hover:bg-base-200/70 transition-all cursor-pointer overtime-shift-card" data-shift-id="${s.id}" data-agent-id="${s.agentId}" data-date="${s.date}" data-start="${s.startTime}" data-end="${s.endTime}">
        <span class="badge badge-sm ${dayBadgeClass} font-black shrink-0">${dayLabel}</span>
        <span class="font-bold text-xs text-base-content flex-1 truncate">${escapeHtml(op?.nombre || 'Operador #' + s.agentId)}</span>
        <span class="font-mono text-xs text-base-content/70 shrink-0">${s.startTime} – ${s.endTime}</span>
        <button type="button" class="btn btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity overtime-delete-shift-btn" data-shift-id="${s.id}" aria-label="Eliminar turno">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
  }).join('');

  container.querySelectorAll('.overtime-shift-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.overtime-delete-shift-btn')) return;
      const dataset = (e.currentTarget as HTMLElement).dataset;
      loadShiftIntoForm({
        id: Number(dataset.shiftId),
        agentId: Number(dataset.agentId),
        date: String(dataset.date),
        startTime: String(dataset.start),
        endTime: String(dataset.end)
      }, weekendDate);
    });
  });

  container.querySelectorAll('.overtime-delete-shift-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const shiftId = (e.currentTarget as HTMLElement).dataset.shiftId;
      if (!shiftId || !overtimeSelectedWeekend) return;
      const confirmed = await showConfirm('¿Eliminar este turno de hora extra?');
      if (!confirmed) return;
      try {
        const res = await fetch(`/api/cronograma/overtime/shifts?id=${shiftId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        showToast('Turno eliminado', 'success');
        await refreshOvertimeForWeekend(overtimeSelectedWeekend);
      } catch {
        showToast('Error al eliminar turno', 'error');
      }
    });
  });
}

// --- Overtime event handlers ---

document.getElementById('switch-to-overtime-btn')?.addEventListener('click', () => {
  showOvertimeView();
});

const _overtimeWeekendWrapper = document.getElementById('overtime-weekend-date-wrapper');
const _overtimeWeekendInput = document.getElementById('overtime-weekend-date') as HTMLInputElement | null;
if (_overtimeWeekendWrapper && _overtimeWeekendInput) {
  _overtimeWeekendWrapper.addEventListener('click', () => {
    _overtimeWeekendInput.showPicker();
  });
  _overtimeWeekendInput.addEventListener('change', async (e) => {
    e.stopPropagation();
    const val = _overtimeWeekendInput.value;
    if (!val) return;
    const dateObj = new Date(val + 'T12:00:00');
    if (dateObj.getDay() !== 6) {
      showToast('Por favor seleccioná un sábado', 'error');
      _overtimeWeekendInput.value = '';
      return;
    }
    const displayEl = document.getElementById('overtime-weekend-date-display');
    if (displayEl) displayEl.textContent = formatToDDMMYY(val);
    await refreshOvertimeForWeekend(val);
  });
}

// --- Rotation Timeline event handlers ---
const _rotationTimelineWrapper = document.getElementById('rotation-timeline-date-wrapper');
const _rotationTimelineInput = document.getElementById('rotation-timeline-date') as HTMLInputElement | null;
if (_rotationTimelineWrapper && _rotationTimelineInput) {
  _rotationTimelineWrapper.addEventListener('click', () => {
    _rotationTimelineInput.showPicker();
  });
  _rotationTimelineInput.addEventListener('change', (e) => {
    e.stopPropagation();
    const val = _rotationTimelineInput.value;
    if (!val) return;
    const dateObj = new Date(val + 'T12:00:00');
    if (dateObj.getDay() !== 6) {
      showToast('Por favor seleccioná un sábado', 'error');
      _rotationTimelineInput.value = '';
      return;
    }
    const displayEl = document.getElementById('rotation-timeline-date-display');
    if (displayEl) displayEl.textContent = formatToDDMMYY(val);
    rotationTimelineSelectedDate = val;
    renderRotationTimeline(val);
  });
}

document.getElementById('save-overtime-referente-btn')?.addEventListener('click', async () => {
  if (!overtimeSelectedWeekend) {
    showToast('Seleccioná un fin de semana primero', 'error');
    return;
  }
  const referenteSelect = document.getElementById('overtime-referente-select') as HTMLSelectElement | null;
  const referente = referenteSelect?.value || '';
  try {
    const res = await fetch('/api/cronograma/overtime/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekendStartDate: overtimeSelectedWeekend, referente }),
    });
    if (!res.ok) throw new Error('Error al guardar');
    const saved: WeekendOvertimeConfig = await res.json();
    const idx = overtimeConfigs.findIndex(c => c.weekendStartDate === saved.weekendStartDate);
    if (idx >= 0) overtimeConfigs[idx] = saved;
    else overtimeConfigs.push(saved);
    showToast('Configuración guardada', 'success');
  } catch {
    showToast('Error al guardar la configuración', 'error');
  }
});

const _overtimeShiftForm = document.getElementById('overtime-shift-form') as HTMLFormElement | null;
if (_overtimeShiftForm) {
  _overtimeShiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!overtimeSelectedWeekend) {
      showToast('Seleccioná un fin de semana primero', 'error');
      return;
    }
    const agentIdVal = (document.getElementById('overtime-shift-agent') as HTMLSelectElement).value;
    const dayVal = (document.getElementById('overtime-shift-day') as HTMLSelectElement).value;
    const startTime = (document.getElementById('overtime-shift-start') as HTMLInputElement).value;
    const endTime = (document.getElementById('overtime-shift-end') as HTMLInputElement).value;
    const editId = (document.getElementById('overtime-shift-edit-id') as HTMLInputElement).value;

    if (!agentIdVal || !startTime || !endTime) {
      showToast('Completá todos los campos', 'error');
      return;
    }

    const sundayDateObj = new Date(overtimeSelectedWeekend + 'T12:00:00');
    sundayDateObj.setDate(sundayDateObj.getDate() + 1);
    const sundayDate = `${sundayDateObj.getFullYear()}-${String(sundayDateObj.getMonth()+1).padStart(2,'0')}-${String(sundayDateObj.getDate()).padStart(2,'0')}`;
    const shiftDate = dayVal === 'saturday' ? overtimeSelectedWeekend : sundayDate;

    if (dayVal === 'saturday' && startTime < '13:00') {
      showToast('Los turnos del sábado deben iniciar desde las 13:00 hs', 'error');
      return;
    }

    const submitBtn = document.getElementById('overtime-shift-submit-btn') as HTMLButtonElement | null;
    const origHtml = submitBtn?.innerHTML || '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading loading-spinner loading-xs mr-1"></span> Guardando...'; }

    try {
      const body: Record<string, unknown> = {
        weekendStartDate: overtimeSelectedWeekend,
        agentId: parseInt(agentIdVal, 10),
        date: shiftDate,
        startTime,
        endTime,
      };
      if (editId) body.id = parseInt(editId, 10);

      const res = await fetch('/api/cronograma/overtime/shifts', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Error al guardar turno');

      showToast(editId ? 'Turno actualizado' : 'Turno agregado', 'success');
      _overtimeShiftForm.reset();
      (document.getElementById('overtime-shift-edit-id') as HTMLInputElement).value = '';
      document.getElementById('overtime-shift-cancel-btn')?.classList.add('hidden');
      await refreshOvertimeForWeekend(overtimeSelectedWeekend);
    } catch {
      showToast('Error al guardar el turno', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origHtml; }
    }
  });
}

document.getElementById('overtime-shift-cancel-btn')?.addEventListener('click', () => {
  const form = document.getElementById('overtime-shift-form') as HTMLFormElement | null;
  if (form) form.reset();
  (document.getElementById('overtime-shift-edit-id') as HTMLInputElement).value = '';
  document.getElementById('overtime-shift-cancel-btn')?.classList.add('hidden');
  const submitBtn = document.getElementById('overtime-shift-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Agregar Turno';
});

// --- GLOBAL EVENT LISTENERS ---

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

if (safeGetItem('cronoMaximized', 'false') === 'true') {
  updateMaximizeUI(true);
}

// ===================================================
// PASIVA VIEW FUNCTIONS
// ===================================================

function hasPasivaChanges(): boolean {
  if (state.pasivaState.operatorId !== state.pasivaState.originalOperatorId) {
    return true;
  }
  for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
    if (
      week.referenteId !== week.originalReferenteId ||
      week.supervisorName !== week.originalSupervisorName
    ) {
      return true;
    }
  }
  return false;
}

function updatePasivaToolbarUI(): void {
  const editToolbar = document.getElementById('pasiva-edit-toolbar');
  const saveBtn = document.getElementById('pasiva-save-btn') as HTMLButtonElement | null;
  const discardBtn = document.getElementById('pasiva-discard-btn') as HTMLButtonElement | null;
  const hasChanges = hasPasivaChanges();

  if (hasChanges) {
    if (editToolbar) {
      editToolbar.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-32');
    }
    if (saveBtn) saveBtn.disabled = false;
    if (discardBtn) discardBtn.disabled = false;
  } else {
    if (editToolbar) {
      editToolbar.classList.add('opacity-0', 'pointer-events-none', 'translate-y-32');
    }
  }
}

async function savePasivaChanges(btn: HTMLButtonElement): Promise<void> {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

  btn.disabled = true;
  btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span>`;

  const weeks = Object.values(state.pasivaState.weeklyAssignments).map(w => ({
    startDate: w.startDate,
    endDate: w.endDate,
    supervisorName: w.supervisorName,
    referenteId: w.referenteId,
  }));

  const payload = {
    month,
    operatorId: state.pasivaState.operatorId,
    weeklyAssignments: weeks,
  };

  try {
    const res = await fetch('/api/cronograma/guardia-pasiva', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error('Error al guardar cambios de guardia pasiva');
    }

    state.pasivaState.originalOperatorId = state.pasivaState.operatorId;
    for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
      week.originalReferenteId = week.referenteId;
      week.originalSupervisorName = week.supervisorName;
    }

    updatePasivaToolbarUI();

    btn.innerText = "Guardado!";
    setTimeout(() => { btn.innerText = "Guardar"; btn.disabled = false; }, 2000);
    showToast("Guardia pasiva guardada con éxito", "success");

    await renderPasivaView();
  } catch (err) {
    console.error(err);
    btn.innerText = "Error";
    btn.classList.add('btn-error');
    setTimeout(() => {
      btn.innerText = "Guardar";
      btn.classList.remove('btn-error');
      btn.disabled = false;
    }, 2000);
    const discardBtn = document.getElementById('pasiva-discard-btn') as HTMLButtonElement | null;
    if (discardBtn) discardBtn.disabled = false;
    showToast("Error al guardar cambios de guardia pasiva", "error");
  }
}

function discardPasivaChanges(): void {
  state.pasivaState.operatorId = state.pasivaState.originalOperatorId;
  for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
    week.referenteId = week.originalReferenteId;
    week.supervisorName = week.originalSupervisorName;
  }
  
  const monthlyOperatorSelect = document.getElementById('pasiva-monthly-operator-select') as HTMLSelectElement | null;
  if (monthlyOperatorSelect) {
    monthlyOperatorSelect.value = state.pasivaState.operatorId ? String(state.pasivaState.operatorId) : '';
  }

  populatePasivaWeekInputs();
  updatePasivaToolbarUI();
  showToast("Cambios descartados", "info");
}

function showPasivaView(): void {
  const dailyView = document.getElementById('daily-view');
  const monthlyView = document.getElementById('monthly-view');
  const groupsView = document.getElementById('groups-view');
  const overtimeView = document.getElementById('overtime-view');
  const pasivaView = document.getElementById('pasiva-view');
  const datePickerContainer = document.getElementById('date-picker-container');
  
  updateViewSwitcherUI('pasiva');
  
  if (dailyView) dailyView.classList.add('hidden');
  if (monthlyView) monthlyView.classList.add('hidden');
  if (groupsView) groupsView.classList.add('hidden');
  if (overtimeView) overtimeView.classList.add('hidden');
  if (pasivaView) pasivaView.classList.remove('hidden');
  
  if (datePickerContainer) {
    datePickerContainer.classList.add('is-faded');
    setTimeout(() => {
      datePickerContainer.classList.add('hidden');
    }, 300);
  }
  
  renderPasivaView();
}

async function renderPasivaView(): Promise<void> {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const month = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

  const monthlyOperatorSelect = document.getElementById('pasiva-monthly-operator-select') as HTMLSelectElement | null;
  if (monthlyOperatorSelect) {
    monthlyOperatorSelect.innerHTML = '<option value="">SIN OPERADOR</option>';
    state.cronoData.forEach(op => {
      const opt = document.createElement('option');
      opt.value = String(op.id ?? '');
      opt.textContent = op.nombre;
      monthlyOperatorSelect.appendChild(opt);
    });
  }

  try {
    const res = await fetch(`/api/cronograma/guardia-pasiva?month=${month}`);
    if (!res.ok) throw new Error("No se pudo cargar la información de guardia pasiva");
    const data = await res.json();

    state.pasivaState.operatorId = data.operatorId;
    state.pasivaState.originalOperatorId = data.operatorId;

    if (monthlyOperatorSelect) {
      monthlyOperatorSelect.value = data.operatorId ? String(data.operatorId) : '';
    }

    state.pasivaState.weeklyAssignments = {};
    if (data.weeks) {
      data.weeks.forEach((w: any) => {
        state.pasivaState.weeklyAssignments[w.startDate] = {
          startDate: w.startDate,
          endDate: w.endDate,
          supervisorName: w.supervisorName,
          referenteId: w.referenteId,
          originalSupervisorName: w.supervisorName,
          originalReferenteId: w.referenteId,
        };
      });
    }

    populatePasivaWeekInputs();
    updatePasivaToolbarUI();
  } catch (err) {
    console.error("Error loading pasiva data:", err);
    showToast("Error al cargar datos de guardia pasiva", "error");
  }
}

function populatePasivaWeekInputs(): void {
  const tbody = document.getElementById('pasiva-weeks-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  const sortedWeeks = Object.values(state.pasivaState.weeklyAssignments).sort((a, b) => a.startDate.localeCompare(b.startDate));
  
  sortedWeeks.forEach(w => {
    const tr = document.createElement('tr');
    tr.className = 'group hover:bg-base-200/40 transition-colors duration-150 rounded-xl';
    
    const d1 = w.startDate.split('-')[2];
    const m1 = w.startDate.split('-')[1];
    const d2 = w.endDate.split('-')[2];
    const m2 = w.endDate.split('-')[1];
    const label = `${d1}/${m1} a ${d2}/${m2}`;
    
    const tdLabel = document.createElement('td');
    tdLabel.className = 'py-3 pl-4 font-bold text-xs tabular-nums text-base-content/80';
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);
    
    const tdSupervisor = document.createElement('td');
    tdSupervisor.className = 'py-2';
    const supervisorInput = document.createElement('input');
    supervisorInput.type = 'text';
    supervisorInput.className = 'input input-bordered input-sm font-bold text-xs h-9 w-full max-w-xs rounded-xl bg-base-100 focus:outline-none focus:border-secondary';
    supervisorInput.value = w.supervisorName;
    supervisorInput.addEventListener('input', () => {
      w.supervisorName = supervisorInput.value;
      updatePasivaToolbarUI();
    });
    tdSupervisor.appendChild(supervisorInput);
    tr.appendChild(tdSupervisor);
    
    const tdReferente = document.createElement('td');
    tdReferente.className = 'py-2 pr-4';
    const referenteSelect = document.createElement('select');
    referenteSelect.className = 'select select-bordered select-sm font-bold text-xs h-9 w-full max-w-xs rounded-xl bg-base-100 focus:outline-none focus:border-secondary';
    
    referenteSelect.innerHTML = '<option value="">SIN REFERENTE</option>';
    state.cronoData.forEach(op => {
      const opt = document.createElement('option');
      opt.value = String(op.id ?? '');
      opt.textContent = op.nombre;
      referenteSelect.appendChild(opt);
    });
    referenteSelect.value = w.referenteId ? String(w.referenteId) : '';
    referenteSelect.addEventListener('change', () => {
      w.referenteId = referenteSelect.value ? parseInt(referenteSelect.value, 10) : null;
      updatePasivaToolbarUI();
    });
    tdReferente.appendChild(referenteSelect);
    tr.appendChild(tdReferente);
    
    tbody.appendChild(tr);
  });
}

// Add event listeners for Pasiva view
document.getElementById('switch-to-pasiva-btn')?.addEventListener('click', () => {
  showPasivaView();
});

document.getElementById('pasiva-monthly-operator-select')?.addEventListener('change', (e) => {
  const target = e.currentTarget as HTMLSelectElement;
  state.pasivaState.operatorId = target.value ? parseInt(target.value, 10) : null;
  updatePasivaToolbarUI();
});

document.getElementById('pasiva-discard-btn')?.addEventListener('click', () => {
  discardPasivaChanges();
});

document.getElementById('pasiva-save-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  await savePasivaChanges(btn);
});

init();
