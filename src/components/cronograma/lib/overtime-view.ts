import { state } from './state';
import { showToast, showConfirm } from './notifications';
import { formatToDDMMYY } from './rotation-helper';
import { type WeekendOvertimeShift, type WeekendOvertimeConfig } from './types';
import { escapeHtml, timeToMinutes } from './utils';
import { updateViewSwitcherUI } from './dashboard-client';

export let overtimeConfigs: WeekendOvertimeConfig[] = [];
export function setOvertimeConfigs(val: WeekendOvertimeConfig[]) {
  overtimeConfigs = val;
}

export let overtimeSelectedWeekend: string | null = null;
export function setOvertimeSelectedWeekend(val: string | null) {
  overtimeSelectedWeekend = val;
}

export function showOvertimeView(): void {
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

export function renderOvertimeView(): void {
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
    const textEl = document.getElementById('overtime-referente-text');
    if (textEl) {
      textEl.textContent = referenteSelect.value ? referenteSelect.value : 'Sin asignar';
    }
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

export async function refreshOvertimeForWeekend(weekendDate: string): Promise<void> {
  overtimeSelectedWeekend = weekendDate;

  const existingConfig = overtimeConfigs.find(c => c.weekendStartDate === weekendDate);
  const referenteSelect = document.getElementById('overtime-referente-select') as HTMLSelectElement | null;
  if (referenteSelect) {
    referenteSelect.value = existingConfig ? existingConfig.referente : '';
    const textEl = document.getElementById('overtime-referente-text');
    if (textEl) {
      textEl.textContent = existingConfig && existingConfig.referente ? existingConfig.referente : 'Sin asignar';
    }
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

export function renderOvertimeTimeline(weekendDate: string, shifts: WeekendOvertimeShift[]): void {
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
        <div style="width: ${satWidthPct.toFixed(2)}%" class="text-micro font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 border-r border-base-300/50 py-1 px-2 bg-warning/5">Sábado (tarde)</div>
        <div style="width: ${sunWidthPct.toFixed(2)}%" class="text-micro font-black uppercase tracking-wider text-info py-1 px-2 bg-info/5">Domingo</div>
      </div>
      <div class="flex">
        ${hours.map((h, i) => {
          const wp = (60 / TOTAL_MINUTES) * 100;
          const isMidnight = h === '00:00' && i > 0;
          return `<div style="width:${wp.toFixed(2)}%" class="text-micro font-bold text-base-content/40 border-r border-base-300/30 py-1 px-1 shrink-0 ${isMidnight ? 'bg-info/5 text-info/60 font-black border-info/30' : ''}">${h}</div>`;
        }).join('')}
      </div>
    </div>
  `;

  const toMinSinceStart = (dateStr: string, timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    const mins = h * 60 + m;
    return dateStr === weekendDate ? mins - TIMELINE_START_MIN : 11 * 60 + mins;
  };

  const getShiftStartAndEnd = (s: WeekendOvertimeShift) => {
    const startMin = toMinSinceStart(s.date, s.startTime);
    let endMin = toMinSinceStart(s.date, s.endTime);
    if (s.endTime < s.startTime) {
      // Crosses midnight: ends on the next day
      if (s.date === weekendDate) {
        endMin = toMinSinceStart(sundayDate, s.endTime);
      } else {
        // Ends on Monday (next day after Sunday)
        const [eh, em] = s.endTime.split(':').map(Number);
        endMin = 11 * 60 + 24 * 60 + (eh * 60 + em);
      }
    }
    return { startMin, endMin };
  };

  const getOpEarliestStart = (opId: number | undefined): number => {
    if (opId === undefined) return Infinity;
    const opShifts = shifts.filter(s => s.agentId === opId);
    if (opShifts.length === 0) return Infinity;
    return Math.min(...opShifts.map(s => getShiftStartAndEnd(s).startMin));
  };

  const activeOps = state.cronoData
    .filter(op => op.id !== undefined && shifts.some(s => s.agentId === op.id))
    .sort((a, b) => {
      const startA = getOpEarliestStart(a.id);
      const startB = getOpEarliestStart(b.id);
      if (startA !== startB) {
        return startA - startB;
      }
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  
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
      const { startMin, endMin } = getShiftStartAndEnd(s);
      if (startMin < 0 || endMin <= startMin) return '';
      const cappedEndMin = Math.min(endMin, TOTAL_MINUTES);
      const lp = (startMin / TOTAL_MINUTES) * 100;
      const wp = ((cappedEndMin - startMin) / TOTAL_MINUTES) * 100;
      return `<div class="absolute top-1 bottom-1 rounded bg-warning/80 border border-warning flex items-center justify-center overflow-hidden cursor-pointer hover:bg-warning/95 overtime-timeline-bar" style="left:${lp.toFixed(2)}%;width:${wp.toFixed(2)}%;min-width:4px;" title="${escapeHtml(op.nombre)}: ${s.startTime}-${s.endTime}" data-shift-id="${s.id}" data-agent-id="${s.agentId}" data-date="${s.date}" data-start="${s.startTime}" data-end="${s.endTime}"><span class="text-xxs font-black text-warning-content truncate px-1">${s.startTime}-${s.endTime}</span></div>`;
    }).join('');
    return `
      <div class="flex items-stretch min-h-[40px] border-b border-base-300/30 last:border-0">
        <div class="w-36 shrink-0 px-3 py-2 border-r border-base-300/40 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-base-300/50 flex items-center justify-center text-tiny font-black shrink-0">${initials}</div>
          <span class="truncate text-xxs font-bold text-base-content">${escapeHtml(op.nombre)}</span>
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

export function loadShiftIntoForm(shift: { id: number; agentId: number; date: string; startTime: string; endTime: string }, weekendDate: string): void {
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

export function renderOvertimeShiftsList(weekendDate: string, shifts: WeekendOvertimeShift[]): void {
  const container = document.getElementById('overtime-shifts-list');
  if (!container) return;

  if (shifts.length === 0) {
    container.innerHTML = `<div class="text-xs text-base-content/30 text-center py-6 font-bold uppercase tracking-wider">No hay turnos guardados para este fin de semana</div>`;
    return;
  }

  const sortedShifts = [...shifts].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    const startCompare = a.startTime.localeCompare(b.startTime);
    if (startCompare !== 0) return startCompare;
    return a.endTime.localeCompare(b.endTime);
  });

  container.innerHTML = sortedShifts.map(s => {
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

export function setupOvertimeEventListeners(): void {
  document.getElementById('switch-to-overtime-btn')?.addEventListener('click', () => {
    showOvertimeView();
  });

  const overtimeWeekendWrapper = document.getElementById('overtime-weekend-date-wrapper');
  const overtimeWeekendInput = document.getElementById('overtime-weekend-date') as HTMLInputElement | null;
  if (overtimeWeekendWrapper && overtimeWeekendInput) {
    overtimeWeekendWrapper.addEventListener('click', () => {
      overtimeWeekendInput.showPicker();
    });
    overtimeWeekendInput.addEventListener('change', async (e) => {
      e.stopPropagation();
      const val = overtimeWeekendInput.value;
      if (!val) return;
      const dateObj = new Date(val + 'T12:00:00');
      if (dateObj.getDay() !== 6) {
        showToast('Por favor seleccioná un sábado', 'error');
        overtimeWeekendInput.value = '';
        return;
      }
      const displayEl = document.getElementById('overtime-weekend-date-display');
      if (displayEl) displayEl.textContent = formatToDDMMYY(val);
      await refreshOvertimeForWeekend(val);
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

  const overtimeShiftForm = document.getElementById('overtime-shift-form') as HTMLFormElement | null;
  if (overtimeShiftForm) {
    overtimeShiftForm.addEventListener('submit', async (e) => {
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
        overtimeShiftForm.reset();
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
}
