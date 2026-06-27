import { state } from './state';
import { OperatorStatus, type OperatorData } from './types';
import { getDaysInMonth, escapeHtml, timeToMinutes } from './utils';
import { showToast } from './notifications';

export let activeRotationConfig: { startDate: string; startGroup: string; rotationOrder: string } | null = null;
export function setActiveRotationConfig(val: typeof activeRotationConfig) {
  activeRotationConfig = val;
}

export let rotationTimelineSelectedDate: string | null = null;
export function setRotationTimelineSelectedDate(val: string | null) {
  rotationTimelineSelectedDate = val;
}

export function formatToDDMMYY(dateStr: string): string {
  if (!dateStr) return "dd/mm/yy";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return "dd/mm/yy";
  const [year, month, day] = parts;
  return `${day}/${month}/${year.slice(-2)}`;
}

export function isHourCoveredBySchedule(scheduleStr: string, hourStart: number): boolean {
  if (!scheduleStr || scheduleStr === '-') return false;
  const parts = scheduleStr.split('-');
  if (parts.length !== 2) return false;
  const startMin = timeToMinutes(parts[0].trim());
  const endMin = timeToMinutes(parts[1].trim());
  
  const slotStartMin = hourStart * 60;
  const slotEndMin = (hourStart + 1) * 60;
  
  return startMin <= slotStartMin && endMin >= slotEndMin;
}

export function getActiveGroupForDate(dateStr: string): string | null {
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

export function getNextSaturdayForGroup(targetGroup: string): string | null {
  if (!activeRotationConfig) return null;
  const { startDate, startGroup, rotationOrder } = activeRotationConfig;
  if (!startDate || !startGroup || !rotationOrder) return null;

  const groups = rotationOrder.split(",").map((g) => g.trim());
  const N = groups.length;
  if (N === 0) return null;
  if (!groups.includes(targetGroup)) return null;

  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const activeMonthPrefix = dateInput?.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = activeMonthPrefix.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const daysInMonth = getDaysInMonth(year, month);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === 6) {
      const y = date.getFullYear();
      const mStr = String(date.getMonth() + 1).padStart(2, '0');
      const dStr = String(date.getDate()).padStart(2, '0');
      const satStr = `${y}-${mStr}-${dStr}`;
      if (getActiveGroupForDate(satStr) === targetGroup) {
        return satStr;
      }
    }
  }

  // Fallback to original calculation
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

export async function loadRotationConfig(month: string): Promise<void> {
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

export function renderRotationTimeline(dateStr: string): void {
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
          <div class="w-6.5 h-6.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20 flex items-center justify-center text-tiny font-black shrink-0">
            ${initials}
          </div>
          <div class="flex flex-col min-w-0">
            <span class="truncate text-small font-bold text-base-content">${escapeHtml(op.nombre)}</span>
            <span class="text-tiny font-semibold text-base-content/40 leading-tight">${horario}</span>
          </div>
        </td>
        ${hourCells}
      </tr>
    `;
  }).join('');
}

export function setupRotationEventListeners(): void {
  const rotationTimelineWrapper = document.getElementById('rotation-timeline-date-wrapper');
  const rotationTimelineInput = document.getElementById('rotation-timeline-date') as HTMLInputElement | null;
  if (rotationTimelineWrapper && rotationTimelineInput) {
    rotationTimelineWrapper.addEventListener('click', () => {
      rotationTimelineInput.showPicker();
    });
    rotationTimelineInput.addEventListener('change', (e) => {
      e.stopPropagation();
      const val = rotationTimelineInput.value;
      if (!val) return;
      const dateObj = new Date(val + 'T12:00:00');
      if (dateObj.getDay() !== 6) {
        showToast('Por favor seleccioná un sábado', 'error');
        rotationTimelineInput.value = '';
        return;
      }
      const displayEl = document.getElementById('rotation-timeline-date-display');
      if (displayEl) displayEl.textContent = formatToDDMMYY(val);
      setRotationTimelineSelectedDate(val);
      renderRotationTimeline(val);
    });
  }
}
