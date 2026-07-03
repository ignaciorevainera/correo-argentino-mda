import { state } from './state';
import { fetchCronogramaData, fetchCronogramaFullData } from './api';
import { getStatusStyles } from './styles';
import { escapeHtml } from '@lib/sanitize';
import { 
  getDaysInMonth, 
  formatYMD, 
  formatDMY, 
  isCurrentlyWorking, 
  timeToMinutes
} from './utils';
import { exportCSV, exportAsImage } from './exporters';
import { showToast, showConfirm } from './notifications';
import { OperatorStatus, type OperatorData, type WeekendOvertimeShift } from './types';
import { isFeriado, getFeriadoName } from './feriados';
import { getActiveGroupForDate } from './rotation-helper';
import { 
  reloadDataForActiveMonth, 
  updateDateInputDisplay, 
  sortOperators,
  showGroupsView,
  updateViewSwitcherUI,
  resolveOperatorStatusAndHorario
} from './dashboard-client';
import { renderPasivaView } from './pasiva-view';

export function isWorkingAtHour(horario: string, hourStr: string): boolean {
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

export function isBreakAtHour(breakInicio: string, breakFin: string, hourStr: string): boolean {
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

export function updateNavigationButtons(): void {
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

export function updateGroupsActiveMonthBadge(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const groupsSelect = document.getElementById('groups-month-selector') as HTMLSelectElement | null;
  if (groupsSelect && dateInput && dateInput.value) {
    groupsSelect.value = dateInput.value;
  }
}

export function updateMonthDisplay(): void {
  const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
  const mainSelect = document.getElementById('month-selector') as HTMLSelectElement | null;
  if (!dateInput || !mainSelect) return;

  const value = dateInput.value;
  if (!value || !value.includes('-')) {
    mainSelect.value = "";
    return;
  }

  mainSelect.value = value;

  updateNavigationButtons();
  updateGroupsActiveMonthBadge();
}

export function renderMonthSelect(): void {
  const mainSelect = document.getElementById('month-selector') as HTMLSelectElement | null;
  const groupsSelect = document.getElementById('groups-month-selector') as HTMLSelectElement | null;
  if (!mainSelect && !groupsSelect) return;

  const html = state.uniqueMonths.map(ymStr => {
    const [yearStr, monthStr] = ymStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const dateObj = new Date(year, month, 15);
    const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
    const label = formatter.format(dateObj).toUpperCase();
    return `<option value="${ymStr}-01">${label}</option>`;
  }).join('');

  if (mainSelect) mainSelect.innerHTML = html;
  if (groupsSelect) groupsSelect.innerHTML = html;
}

export function changeMonth(offset: number): void {
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

export function renderDaily(): void {
  // Remove container skeleton -- persists only until first render
  document.getElementById('daily-view-skeleton')?.remove();

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
              <span class="text-xxs text-base-content/40 font-medium normal-case mt-0.5">Ningún operador coincide con tu búsqueda o filtro.</span>
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
          <span class="daily-break-badge px-1.5 py-0.5 rounded-full label-xxs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1 shadow-sm shrink-0" title="Break: ${breakStartHourStr} - ${breakEndHourStr}">
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
      if (liveStatus.status === 'online') liveIndicatorClass = "bg-success shadow-glow-success";
      else if (liveStatus.status === 'break') liveIndicatorClass = "bg-warning shadow-glow-warning";

      let ringClass = "bg-base-200/50 text-base-content/60 ring-base-200 border border-base-300";
      let glowColorClass = "bg-primary";
      if (status === OperatorStatus.HomeOffice) {
        ringClass = "bg-secondary/10 text-secondary ring-secondary/30 border border-secondary/20 shadow-sm";
        glowColorClass = "bg-secondary";
      } else if (status === OperatorStatus.PresencialMonteGrande) {
        ringClass = "bg-primary/10 text-amber-700 dark:text-amber-400 ring-primary/30 border border-primary/20 shadow-sm";
        glowColorClass = "bg-amber-500";
      } else if (status === OperatorStatus.PresencialParquePatricios) {
        ringClass = "bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-purple-500/30 border border-purple-500/20 shadow-sm";
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
      const ganttSpanClass = (bg: string) => `relative z-10 text-tiny font-extrabold tracking-tight uppercase px-1.5 py-0.5 rounded ${bg} pointer-events-none ${isHoliday ? 'line-through' : ''}`;
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
                  const bWidth = Math.min(yBEndPct - yBStartPct, yEndPct - yBStartPct);
                  if (bWidth > 0) {
                    breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: ${yBStartPct}%; width: ${bWidth}%;" title="Descanso: ${yBreakStartHourStr} - ${yBreakEndHourStr}"></div>`);
                  }
                } else {
                  // Break crosses midnight
                  const bWidth1 = 100 - yBStartPct;
                  const bWidth2 = yBEndPct;
                  if (yBStartPct < yEndPct) {
                    const w = Math.min(bWidth1, yEndPct - yBStartPct);
                    breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: ${yBStartPct}%; width: ${w}%;" title="Descanso: ${yBreakStartHourStr} - ${yBreakEndHourStr}"></div>`);
                  }
                  if (bWidth2 > 0) {
                    const w = Math.min(bWidth2, yEndPct);
                    breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: 0%; width: ${w}%;" title="Descanso: ${yBreakStartHourStr} - ${yBreakEndHourStr}"></div>`);
                  }
                }
              } else {
                if (yBStartPct < yEndPct) {
                  const w = Math.min(yBEndPct - yBStartPct, yEndPct - yBStartPct);
                  breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: ${yBStartPct}%; width: ${w}%;" title="Descanso: ${yBreakStartHourStr} - ${yBreakEndHourStr}"></div>`);
                }
              }
            }
          }
        }
      }

      // --- 2. TODAY'S SHIFT ---
      let tStartPct = 0;
      let tEndPct = 0;
      let isOvernight = false;

      if (showAsActiveInGantt) {
        const times = dailyHorario.split(' - ');
        if (times.length === 2) {
          tStartPct = getPct(times[0]);
          tEndPct = getPct(times[1]);

          let todayWorkBarBg = 'bg-primary text-amber-900';
          if (status === OperatorStatus.HomeOffice) todayWorkBarBg = 'bg-secondary text-secondary-content';
          else if (status === OperatorStatus.PresencialParquePatricios) todayWorkBarBg = 'bg-purple-500 text-white';

          if (tStartPct <= tEndPct) {
            workBars.push(`
              <div class="gantt-bar-work ${todayWorkBarBg} relative" style="left: ${tStartPct}%; width: ${tEndPct - tStartPct}%;">
                <span class="${ganttSpanClass(todayWorkBarBg)}">${times[0]} - ${times[1]}</span>
              </div>
            `);
          } else {
            // Overnight shift
            isOvernight = true;
            workBars.push(`
              <div class="gantt-bar-work ${todayWorkBarBg} relative" style="left: ${tStartPct}%; width: ${100 - tStartPct}%; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                <span class="${ganttSpanClass(todayWorkBarBg)}">${times[0]} - ${times[1]}</span>
              </div>
            `);
          }

          // Break bar for today
          if (breakStartHourStr && breakEndHourStr) {
            const bStartPct = getPct(breakStartHourStr);
            const bEndPct = getPct(breakEndHourStr);
            const tooltipHtml = `<div class="gantt-break-tooltip">Descanso: ${breakStartHourStr} - ${breakEndHourStr}</div>`;

            if (bStartPct <= bEndPct) {
              breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: ${bStartPct}%; width: ${bEndPct - bStartPct}%;" title="Descanso: ${breakStartHourStr} - ${breakEndHourStr}">${tooltipHtml}</div>`);
            } else {
              breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: ${bStartPct}%; width: ${100 - bStartPct}%;" title="Descanso: ${breakStartHourStr} - ${breakEndHourStr}">${tooltipHtml}</div>`);
              breakBars.push(`<div class="gantt-bar-break relative z-20" style="left: 0%; width: ${bEndPct}%;" title="Descanso: ${breakStartHourStr} - ${breakEndHourStr}">${tooltipHtml}</div>`);
            }
          }
        }
      }

      // --- 3. OVERTIME SHIFTS VISUALIZATION ---
      if (dayOvertime) {
        const otStartPct = getPct(dayOvertime.startTime);
        const otEndPct = getPct(dayOvertime.endTime);
        const otBg = 'bg-warning text-warning-content border border-warning';
        if (otStartPct <= otEndPct) {
          workBars.push(`
            <div class="gantt-bar-work ${otBg} relative z-15" style="left: ${otStartPct}%; width: ${otEndPct - otStartPct}%;" title="Hora Extra: ${dayOvertime.startTime} - ${dayOvertime.endTime}">
              <span class="${ganttSpanClass(otBg)} text-tiny font-black">HE: ${dayOvertime.startTime}-${dayOvertime.endTime}</span>
            </div>
          `);
        } else {
          workBars.push(`
            <div class="gantt-bar-work ${otBg} relative z-15" style="left: ${otStartPct}%; width: ${100 - otStartPct}%; border-top-right-radius: 0; border-bottom-right-radius: 0;" title="Hora Extra: ${dayOvertime.startTime} - ${dayOvertime.endTime}">
              <span class="${ganttSpanClass(otBg)} text-tiny font-black">HE: ${dayOvertime.startTime}-${dayOvertime.endTime}</span>
            </div>
          `);
        }
      }

      if (isAbsent || isFranco) {
        const inactiveText = isFranco ? 'Franco / Día Libre' : (status === OperatorStatus.Vacaciones ? 'Vacaciones' : 'Licencia Médica');
        const inactiveBg = isFranco 
          ? 'bg-base-200 text-base-content/40 border border-base-300/40' 
          : (status === OperatorStatus.Vacaciones 
              ? 'bg-success/10 text-success border border-success/20' 
              : 'bg-error/10 text-error border border-error/20');
        ganttContentHtml = `
          <div class="gantt-inactive-bar ${inactiveBg}">
            ${inactiveText}
          </div>
        `;
      } else {
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
          
          ${workBars.join('')}
          ${breakBars.join('')}
          
          <!-- Inactive timeline guide bars -->
          ${!isOvernight && tEndPct < 100 && (!dayOvertime || tEndPct >= getPct(dayOvertime.startTime)) ? `
            <div class="${ganttInactiveBarClass('bg-base-300/10')}" style="left: ${tEndPct}%; width: ${100 - tEndPct}%;"></div>
          ` : ''}
          ${tStartPct > 0 && (!hasYesterdayContinuation || yEndPct <= tStartPct) ? `
            <div class="${ganttInactiveBarClass('bg-base-300/10')}" style="left: ${hasYesterdayContinuation ? yEndPct : 0}%; width: ${tStartPct - (hasYesterdayContinuation ? yEndPct : 0)}%;"></div>
          ` : ''}
        `;
      }

      const timelineBg = isHoliday ? 'bg-orange-100/10 dark:bg-orange-950/10' : '';

      rowsHtml += `
        <tr class="hover:bg-base-200/40 transition-all duration-200 group border-b border-base-200/50 last:border-0">
          <td class="sticky left-0 bg-base-100 z-40 w-64 min-w-[16rem] px-6 py-4 border-r border-base-300/40 relative group-hover:bg-base-200 transition-colors">
            <div class="flex items-center gap-4">
              <div class="relative w-10 h-10 shrink-0">
                <div class="absolute inset-0 rounded-full blur-[2px] opacity-0 group-hover:opacity-30 transition-opacity duration-300 ${status === OperatorStatus.PresencialMonteGrande || status === OperatorStatus.PresencialParquePatricios ? 'bg-secondary' : (status === OperatorStatus.HomeOffice ? 'bg-amber-500' : 'bg-primary')}"></div>
                <div class="relative w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-black ring-1 ring-base-300 transition-all duration-300 group-hover:scale-110 group-hover:ring-offset-2 group-hover:ring-offset-base-100 ${ringClass}">
                  ${initials}
                </div>
                <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-base-100 ${liveIndicatorClass}" title="${liveStatus.text}"></div>
              </div>
              <div class="flex flex-col min-w-0">
                <button 
                  class="font-bold text-sm text-base-content truncate group-hover:text-secondary transition-colors text-left hover:underline underline-offset-4"
                  data-op-profile="${op.nombre}"
                >
                  ${op.nombre}
                </button>
                <span class="text-[10px] text-base-content/40 font-black tracking-widest uppercase truncate">${username}</span>
              </div>
            </div>
          </td>
          <td class="sticky left-64 bg-base-100 z-40 w-44 min-w-44 px-4 py-4 border-r border-base-300/40 group-hover:bg-base-200 transition-colors shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">
            <div class="flex items-center gap-3">
               <div class="w-8 h-8 rounded-lg flex items-center justify-center text-base border border-base-300/30 ${styles.bgClass}">
                  ${styles.icon}
               </div>
               <div class="flex flex-col gap-1 items-start">
                 <span class="${styles.badge} whitespace-nowrap text-xxs">${status}</span>
                 ${breakBadgeHtml ? `<div class="mt-1">${breakBadgeHtml}</div>` : ''}
               </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="gantt-container ${timelineBg}">
              ${ganttContentHtml}
            </div>
          </td>
        </tr>
      `;
    });
  }

  if (tableBody) tableBody.innerHTML = rowsHtml;
}

export function renderHourly(dateStr: string): void {
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
      <th colspan="${hours.length}" class="sticky top-0 text-center py-3 bg-base-100 text-secondary border-b border-base-200 group z-40">
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
    theadHtml += `<th class="sticky top-[44px] text-center min-w-12 px-0 border-r border-b border-base-200 py-2 bg-base-100 z-40">
      <span class="font-extrabold text-xxs tracking-wide text-base-content/60">${hour}</span>
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

        let spanClass = `text-tiny ${isAbsent ? 'text-error' : isFranco ? 'text-base-content/40' : 'text-base-content/60'} font-black tracking-widest uppercase truncate mt-0.5`;
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

        let hS = -1, hE = -1;
        if (horario && horario !== '-' && horario !== 'Franco') {
          const parts = horario.split(' - ');
          if (parts.length === 2) {
            hS = parseInt(parts[0].split(':')[0], 10);
            hE = parseInt(parts[1].split(':')[0], 10);
          }
        }

        let bhS = -1, bhE = -1;
        if (breakStart && breakEnd && breakStart !== '-' && breakEnd !== '-') {
          bhS = parseInt(breakStart.split(':')[0], 10);
          bhE = parseInt(breakEnd.split(':')[0], 10);
        }

        hours.forEach((hour, i) => {
           const working = hS !== -1 && hE !== -1 && (hS <= hE ? (i >= hS && i < hE) : (i >= hS || i < hE));
           const onBreak = working && bhS !== -1 && bhE !== -1 && (bhS <= bhE ? (i >= bhS && i < bhE) : (i >= bhS || i < bhE));
           if (onBreak) {
              tbodyHtml += `<td class="border-r border-base-200/50 p-1 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                 <div class="hourly-break-cell w-full h-full rounded border border-dashed border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity min-h-7 shadow-sm cursor-help" title="Descanso: ${breakStart} - ${breakEnd}">
                   <span class="text-xxs">☕</span>
                 </div>
              </td>`;
            } else if (working && !isFranco) {
               const hourBgClass = isHoliday ? '!bg-orange-200 dark:!bg-orange-600 !text-orange-800 dark:!text-orange-100' : styles.bgClass;
               tbodyHtml += `<td class="border-r border-base-200/50 p-1 bg-base-200/10">
                  <div class="w-full h-full rounded ${hourBgClass} flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity min-h-7 shadow-sm">
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
  
  if (tfoot) tfoot.innerHTML = `<tr><td colspan="${hours.length + 1}" class="bg-base-200 py-3 text-center border-t border-base-300 text-xxs font-black text-base-content/30 uppercase tracking-[0.2em]">Fin del reporte diario</td></tr>`;
}

export function renderMonthly(): void {
  // Remove container skeleton -- persists only until first render
  document.getElementById('monthly-view-skeleton')?.remove();

  if (state.focusedDateStr) {
    renderHourly(state.focusedDateStr);
    return;
  }

  const container = document.getElementById('cronograma-app-container');
  const userRole = container?.dataset.userRole || 'agent';
  const isReadOnly = ['agent', 'referent'].includes(userRole);
  const hideComments = isReadOnly;
  const hideTotals = isReadOnly;

  if (hideTotals) {
    state.isTotalsCollapsed = true;
  }
  if (isReadOnly) {
    state.isCoverageMinimized = true;
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
    else if (isWeekend) thClass = thClass.replace("bg-base-100", "bg-base-200 text-base-content/65");
    else if (isCritical) thClass += " text-error font-bold";
    else thClass += " text-base-content/85";

    const dayName = shortDayFormatter.format(d).substring(0, 2).toUpperCase();
    const dateNum = d.getDate();
    const monthName = monthLongFormatter.format(d);

    const activeGroup = getActiveGroupForDate(date);

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
      isHoliday,
      activeGroup
    };
  });

  const totalsToggleIcon = state.isTotalsCollapsed ? 
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>` : 
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>`;

  const thShadowClass = state.isTotalsCollapsed ? 'shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]' : '';

  let theadHtml = `<tr>
    <th class="sticky top-0 left-0 bg-base-100 z-50 w-[200px] min-w-[200px] border-r border-b border-base-200 px-6 py-4 font-black text-xs uppercase tracking-widest text-base-content/85 ${thShadowClass}">
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
      <th class="sticky top-0 left-[200px] bg-base-100 z-50 w-[40px] min-w-[40px] border-r border-b border-base-200 px-1 py-4 font-black text-tiny uppercase tracking-widest text-base-content/80 text-center" title="Presencial">P</th>
      <th class="sticky top-0 left-[240px] bg-base-100 z-50 w-[40px] min-w-[40px] border-r border-b border-base-200 px-1 py-4 font-black text-tiny uppercase tracking-widest text-base-content/80 text-center" title="Home Office">HO</th>
      <th class="sticky top-0 left-[280px] bg-base-100 z-50 w-[40px] min-w-[40px] border-r border-b border-base-200 px-1 py-4 font-black text-tiny uppercase tracking-widest text-base-content/80 text-center shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]" title="Licencia/Vacaciones">L</th>
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
          <span class="font-extrabold text-xxs tracking-wide ${pd.isToday ? 'text-secondary-content/95' : 'text-base-content/90'}">${pd.dayName}</span>
          <div class="flex items-center gap-1">
             <span class="font-black text-xs ${pd.isToday ? 'scale-110 text-secondary-content' : 'text-base-content'}">${pd.dateNum}</span>
             ${pd.isCritical ? '<div class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></div>' : ''}
          </div>
          ${pd.isToday ? `<span class="text-micro font-black tracking-wide uppercase text-secondary-content/90">HOY</span>` : ''}
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
            <span class="text-xxs text-base-content/40 font-medium normal-case mt-0.5">Ningún operador coincide con tu búsqueda o filtro.</span>
          </div>
        </div>
      </td>
    </tr>`;
  } else {
    sortedOps.forEach((op, opIdx) => {
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

      const showViolation = !isReadOnly && (hoViolation || pWeekViolation);
      const showHOViolation = !isReadOnly && hoViolation;
      const showPWeekViolation = !isReadOnly && pWeekViolation;

      const opShadowClass = state.isTotalsCollapsed ? 'shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]' : '';

      tbodyHtml += `<tr class="group ${showViolation ? 'bg-error/2' : ''}" data-op-name="${op.nombre.toLowerCase()}">
        <td class="sticky left-0 bg-base-100 z-30 w-[200px] min-w-[200px] font-bold py-3 px-6 text-xs border-r border-b border-base-200/70 group-hover:bg-base-200 transition-colors ${opShadowClass}">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full ${showViolation ? 'bg-error animate-pulse' : 'bg-base-300 group-hover:bg-amber-500'} transition-all shadow-sm cursor-pointer hover:scale-125 hover:ring-2 hover:ring-secondary/50 op-row-dot ${state.isEditMode ? 'op-row-header' : ''}" title="${state.isEditMode ? 'Pintar toda la fila' : 'Destacar fila'}"></span>
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
              ${showHOViolation ? `<span class="text-tiny bg-error/10 border border-error/20 px-2 py-0.5 rounded-md font-black text-error uppercase tracking-wider mt-1 inline-block w-fit shadow-sm">⚠️ Exceso de HO (${maxConsecutiveHO}d)</span>` : ''}
              ${showPWeekViolation ? `<span class="text-tiny bg-error/10 border border-error/20 px-2 py-0.5 rounded-md font-black text-error uppercase tracking-wider mt-1 inline-block w-fit shadow-sm">⚠️ Faltan días P.</span>` : ''}
            </div>
          </div>
        </td>
      `;

      if (!state.isTotalsCollapsed) {
        tbodyHtml += `
          <td class="sticky left-[200px] bg-base-100 z-30 w-[40px] min-w-[40px] py-3 px-1 text-center text-xxs font-black border-r border-b border-base-200/70 text-secondary group-hover:bg-base-200 transition-colors">${stats.P}</td>
          <td class="sticky left-[240px] bg-base-100 z-30 w-[40px] min-w-[40px] py-3 px-1 text-center text-xxs font-black border-r border-b border-base-200/70 text-amber-700 dark:text-amber-400 group-hover:bg-base-200 transition-colors">${stats.HO}</td>
          <td class="sticky left-[280px] bg-base-100 z-30 w-[40px] min-w-[40px] py-3 px-1 text-center text-xxs font-black border-r border-b border-base-200/70 text-error group-hover:bg-base-200 transition-colors shadow-table-edge">${stats.L}</td>
        `;
      }
        
      parsedDates.forEach(pd => {
        const date = pd.str;
        const { status, horario: dailyHorario } = resolveOperatorStatusAndHorario(op, date, pd.day, pd.activeGroup);
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
        
        const isHoliday = pd.isHoliday;
        if (isHoliday) cellClass += ' bg-orange-100 dark:bg-orange-950';
        
        const hasComment = !hideComments && !!(op.comentarios && op.comentarios[date]);
        const dayOvertime = (op.weekendOvertimes || []).find(s => s.date === date);
        const otAttr = dayOvertime ? `data-overtime="${escapeHtml(dayOvertime.startTime + ' - ' + dayOvertime.endTime)}"` : '';

        if (isFrancoCell) {
          let francoBtnClass = `monthly-cell-button h-12 flex flex-col items-center justify-center relative hover:z-[60] ${isTodayCell ? 'bg-base-300/40 border border-base-content/25' : 'bg-base-200/20 border border-base-300/20'}`;
          if (isHoliday) {
            francoBtnClass += " line-through opacity-60 !bg-orange-200/60 dark:!bg-orange-600/60 !border-orange-300 dark:!border-orange-500";
          }
          let tooltipAttrs = '';
          if (dayOvertime) {
            const tooltipDir = opIdx === 0 ? 'tooltip-bottom' : 'tooltip-top';
            francoBtnClass += ` tooltip ${tooltipDir} tooltip-neutral`;
            tooltipAttrs = `data-tip="HE: ${escapeHtml(dayOvertime.startTime + ' - ' + dayOvertime.endTime)}"`;
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
              data-comment="${hideComments ? '' : escapeHtml(op.comentarios?.[date] || '')}"
              data-break-inicio="${escapeHtml(breakInicio)}"
              data-break-fin="${escapeHtml(breakFin)}"
              aria-label="${francoAria}"
              ${otAttr}
              ${(isHoliday && pd.feriadoName && !dayOvertime) ? `title="Franco (Feriado: ${pd.feriadoName})"` : ''}
              ${tooltipAttrs}
            >
              ${dayOvertime ? `<span class="text-micro font-black text-base-content bg-warning/25 border border-warning/40 px-1 py-0.5 rounded tracking-tight">HE: ${dayOvertime.startTime}</span>` : ''}
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

        let statusBtnClass = `monthly-cell-button h-12 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer hover:scale-110 hover:z-[60] relative border ${isTodayCell ? 'border-secondary/40 ring-1 ring-secondary/30 shadow-[0_0_10px_rgba(37,72,136,0.1)]' : 'border-base-300/30'} ${styles.bgClass} shadow-sm hover:shadow-lg ${isLicenseOverlap ? 'border-error/40' : ''}`;
        
        let tooltipAttrs = '';
        if (status === OperatorStatus.PresencialMonteGrande || status === OperatorStatus.PresencialParquePatricios || status === OperatorStatus.HomeOffice) {
          const tooltipDir = opIdx === 0 ? 'tooltip-bottom' : 'tooltip-top';
          statusBtnClass += ` tooltip ${tooltipDir} tooltip-neutral`;
          tooltipAttrs = `data-tip="${safeHorario}"`;
        }

        const isSaturday = pd.day === 6;
        const isRotationCell = !!(isSaturday && op.saturdayGroup && op.saturdayGroup === pd.activeGroup && !(op.overrides && op.overrides[date]));
        
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
              ${tooltipAttrs ? '' : `title="${statusTitle}"`}
              data-monthly-detail
              data-operator="${safeName}"
              data-date="${safeDate}"
              data-status="${safeStatus}"
              data-horario="${safeHorario}"
              data-username="${escapeHtml(username)}"
              data-comment="${hideComments ? '' : escapeHtml(op.comentarios?.[date] || '')}"
              data-break-inicio="${escapeHtml(breakInicio)}"
              data-break-fin="${escapeHtml(breakFin)}"
              aria-label="${statusAria}"
              ${otAttr}
              ${isRotationCell ? `data-saturday-rotation="true" data-rotation-horario="${escapeHtml(op.saturdayHorario || '07:00 - 13:00')}"` : ''}
              ${tooltipAttrs}
            >
              <span class="font-black text-xs tracking-tight">${initials}</span>
              ${dayOvertime ? `<span class="text-micro font-black text-base-content bg-warning/25 border border-warning/40 px-1 py-0.5 rounded tracking-tight mt-0.5 scale-90">HE: ${dayOvertime.startTime}</span>` : ''}
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
        <span class="text-xxs font-black uppercase tracking-widest text-base-content/60">Resumen Cobertura</span>
        ${isReadOnly ? '' : `
        <button
          type="button"
          id="toggle-coverage-btn"
          class="btn btn-xs btn-ghost p-0.5 rounded hover:bg-base-300 text-base-content/50 hover:text-base-content transition-all"
          title="${state.isCoverageMinimized ? 'Maximizar resumen de cobertura' : 'Minimizar resumen de cobertura'}"
          aria-label="${state.isCoverageMinimized ? 'Maximizar resumen de cobertura' : 'Minimizar resumen de cobertura'}"
        >
          ${chevronIcon}
        </button>
        `}
      </div>
    </td>
  `;

  if (!state.isTotalsCollapsed) {
    tfootHtml += `
      <td class="sticky left-[200px] bg-base-200 z-50 w-[40px] min-w-[40px] text-center ${pyClass} text-xxs font-black border-r border-base-300 text-base-content/40" title="Total Operadores">${teamSize}</td>
      <td class="sticky left-[240px] bg-base-200 z-50 w-[40px] min-w-[40px] text-center ${pyClass} text-xxs font-black border-r border-base-300 text-base-content/20">-</td>
      <td class="sticky left-[280px] bg-base-200 z-50 w-[40px] min-w-[40px] text-center ${pyClass} text-xxs font-black border-r border-base-300 text-base-content/20 shadow-[4px_0_10px_-5px_rgba(0,0,0,0.1)]">-</td>
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
      <td class="${cellPyClass} border-r border-base-200/50 min-w-16 ${isLowCoverage ? 'bg-error/5' : ''}">
        <div class="flex flex-col items-center gap-1.5">
           ${state.isCoverageMinimized ? '' : `
           <div class="flex flex-col w-2.5 h-12 bg-base-300/30 rounded-full overflow-hidden justify-end shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
              <div class="bg-purple-500 w-full transition-all duration-500" style="height: ${pppPercent}%" title="P. Parque Patricios: ${c.ppp}"></div>
              <div class="bg-amber-500 w-full transition-all duration-500" style="height: ${pmgPercent}%" title="P. Monte Grande: ${c.pmg}"></div>
              <div class="bg-secondary w-full transition-all duration-500" style="height: ${hoPercent}%" title="HO: ${c.ho}"></div>
           </div>
           `}
           <div class="flex flex-col items-center">
              <span class="text-xxs font-black ${isLowCoverage ? 'text-error' : 'text-base-content/60'}">${c.pmg + c.ppp + c.ho}</span>
              <span class="text-micro font-black uppercase opacity-30">Activos</span>
           </div>
        </div>
      </td>
    `;
  });
  tfootHtml += `</tr>`;

  const tfoot = document.getElementById('monthly-tfoot');
  if (tfoot) tfoot.innerHTML = tfootHtml;
}
