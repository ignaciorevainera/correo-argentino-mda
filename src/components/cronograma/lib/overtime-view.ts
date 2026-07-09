import { state } from './state';
import { showToast, showConfirm } from './notifications';
import { formatToDDMMYY } from './rotation-helper';
import { type WeekendOvertimeShift, type WeekendOvertimeConfig } from './types';
import { escapeHtml } from '@lib/sanitize';
import { timeToMinutes } from './utils';
import { updateViewSwitcherUI } from './dashboard-client';

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

  if (state.overtimeSelectedWeekend) {
    refreshOvertimeForWeekend(state.overtimeSelectedWeekend);
  }
}

export async function refreshOvertimeForWeekend(weekendDate: string): Promise<void> {
  state.overtimeSelectedWeekend = weekendDate;

  const displayEl = document.getElementById('overtime-weekend-date-display');
  if (displayEl) {
    displayEl.textContent = formatToDDMMYY(weekendDate);
  }

  const existingConfig = state.overtimeConfigs.find(c => c.weekendStartDate === weekendDate);
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
  const deleteBtn = document.getElementById('overtime-shift-delete-btn');

  if (agentSelect) agentSelect.value = String(shift.agentId);
  if (daySelect) daySelect.value = shift.date === weekendDate ? 'saturday' : 'sunday';
  if (startInput) startInput.value = shift.startTime;
  if (endInput) endInput.value = shift.endTime;
  if (editIdInput) editIdInput.value = String(shift.id);

  if (submitBtn) submitBtn.textContent = 'Actualizar Turno';
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  if (deleteBtn) {
    deleteBtn.classList.remove('hidden');
    deleteBtn.dataset.shiftId = String(shift.id);
  }
}
function calcDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 1440;
  return Math.round((mins / 60) * 10) / 10;
}

export function renderOvertimeShiftsList(weekendDate: string, shifts: WeekendOvertimeShift[]): void {
  const container = document.getElementById('overtime-shifts-list');
  if (!container) return;

  if (shifts.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-base-content/20 gap-2">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/></svg>
        <p class="text-xs font-bold uppercase tracking-wider">No hay turnos guardados</p>
      </div>`;
    return;
  }

  const sorted = [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const sc = a.startTime.localeCompare(b.startTime);
    return sc !== 0 ? sc : a.endTime.localeCompare(b.endTime);
  });

  const sats = sorted.filter(s => s.date === weekendDate);
  const suns = sorted.filter(s => s.date !== weekendDate);

  function renderRow(s: WeekendOvertimeShift): string {
    const op = state.cronoData.find(o => o.id === s.agentId);
    const initials = op?.nombre?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
    const dur = calcDuration(s.startTime, s.endTime);
    return `
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-100/50 border border-base-300/40 group hover:bg-base-100 transition-all cursor-pointer overtime-shift-card" data-shift-id="${s.id}" data-agent-id="${s.agentId}" data-date="${s.date}" data-start="${s.startTime}" data-end="${s.endTime}">
        <div class="w-5 h-5 rounded-full bg-base-300/60 flex items-center justify-center text-tiny font-black shrink-0">${initials}</div>
        <span class="text-xs font-semibold text-base-content truncate flex-1">${escapeHtml(op?.nombre?.split(' ')[0] || '#' + s.agentId)}</span>
        <span class="font-mono text-xxs font-bold text-base-content/40 shrink-0">${s.startTime}–${s.endTime}</span>
        <span class="text-xxs font-bold text-warning shrink-0">${dur}h</span>
        <button type="button" class="btn btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity overtime-delete-shift-btn p-1 min-h-0 h-auto" data-shift-id="${s.id}" aria-label="Eliminar">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="space-y-2">
        <p class="text-xxs font-black uppercase tracking-wider text-warning pb-1.5 border-b border-warning/30">Sábado</p>
        ${sats.length ? sats.map(renderRow).join('') : '<p class="text-xxs text-base-content/30 text-center py-4">Sin turnos</p>'}
      </div>
      <div class="space-y-2">
        <p class="text-xxs font-black uppercase tracking-wider text-info pb-1.5 border-b border-info/30">Domingo</p>
        ${suns.length ? suns.map(renderRow).join('') : '<p class="text-xxs text-base-content/30 text-center py-4">Sin turnos</p>'}
      </div>
    </div>`;

  container.querySelectorAll('.overtime-shift-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.overtime-delete-shift-btn')) return;
      const ds = (e.currentTarget as HTMLElement).dataset;
      loadShiftIntoForm({ id: Number(ds.shiftId), agentId: Number(ds.agentId), date: String(ds.date), startTime: String(ds.start), endTime: String(ds.end) }, weekendDate);
    });
  });

  container.querySelectorAll('.overtime-delete-shift-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const shiftId = (e.currentTarget as HTMLElement).dataset.shiftId;
      if (!shiftId || !state.overtimeSelectedWeekend) return;
      if (!await showConfirm('¿Eliminar este turno de hora extra?')) return;
      try {
        const res = await fetch(`/api/cronograma/overtime/shifts?id=${shiftId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        showToast('Turno eliminado', 'success');
        const form = document.getElementById('overtime-shift-form') as HTMLFormElement | null;
        if (form) form.reset();
        (document.getElementById('overtime-shift-edit-id') as HTMLInputElement).value = '';
        document.getElementById('overtime-shift-cancel-btn')?.classList.add('hidden');
        document.getElementById('overtime-shift-delete-btn')?.classList.add('hidden');
        const submitBtn = document.getElementById('overtime-shift-submit-btn');
        if (submitBtn) submitBtn.textContent = 'Agregar Turno';
        await refreshOvertimeForWeekend(state.overtimeSelectedWeekend);
      } catch { showToast('Error al eliminar turno', 'error'); }
    });
  });
}

export function setupOvertimeEventListeners(): void {
  document.getElementById('switch-to-overtime-btn')?.addEventListener('click', () => {
    showOvertimeView();
  });



  document.getElementById('save-overtime-referente-btn')?.addEventListener('click', async () => {
    if (!state.overtimeSelectedWeekend) {
      showToast('Seleccioná un fin de semana primero', 'error');
      return;
    }
    const referenteSelect = document.getElementById('overtime-referente-select') as HTMLSelectElement | null;
    const referente = referenteSelect?.value || '';
    try {
      const res = await fetch('/api/cronograma/overtime/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekendStartDate: state.overtimeSelectedWeekend, referente }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      const saved: WeekendOvertimeConfig = await res.json();
      const idx = state.overtimeConfigs.findIndex(c => c.weekendStartDate === saved.weekendStartDate);
      if (idx >= 0) state.overtimeConfigs[idx] = saved;
      else state.overtimeConfigs.push(saved);
      showToast('Configuración guardada', 'success');
    } catch {
      showToast('Error al guardar la configuración', 'error');
    }
  });

  const overtimeShiftForm = document.getElementById('overtime-shift-form') as HTMLFormElement | null;
  if (overtimeShiftForm) {
    overtimeShiftForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.overtimeSelectedWeekend) {
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

      const sundayDateObj = new Date(state.overtimeSelectedWeekend + 'T12:00:00');
      sundayDateObj.setDate(sundayDateObj.getDate() + 1);
      const sundayDate = `${sundayDateObj.getFullYear()}-${String(sundayDateObj.getMonth()+1).padStart(2,'0')}-${String(sundayDateObj.getDate()).padStart(2,'0')}`;
      const shiftDate = dayVal === 'saturday' ? state.overtimeSelectedWeekend : sundayDate;

      if (dayVal === 'saturday' && startTime < '13:00') {
        showToast('Los turnos del sábado deben iniciar desde las 13:00 hs', 'error');
        return;
      }

      const submitBtn = document.getElementById('overtime-shift-submit-btn') as HTMLButtonElement | null;
      const origHtml = submitBtn?.innerHTML || '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading loading-spinner loading-xs mr-1"></span> Guardando...'; }

      try {
        const body: Record<string, unknown> = {
          weekendStartDate: state.overtimeSelectedWeekend,
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
        document.getElementById('overtime-shift-delete-btn')?.classList.add('hidden');
        await refreshOvertimeForWeekend(state.overtimeSelectedWeekend);
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
    document.getElementById('overtime-shift-delete-btn')?.classList.add('hidden');
    const submitBtn = document.getElementById('overtime-shift-submit-btn');
    if (submitBtn) submitBtn.textContent = 'Agregar Turno';
  });

  document.getElementById('overtime-shift-delete-btn')?.addEventListener('click', async () => {
    const shiftId = (document.getElementById('overtime-shift-delete-btn') as HTMLElement).dataset.shiftId;
    if (!shiftId || !state.overtimeSelectedWeekend) return;
    const confirmed = await showConfirm('¿Eliminar este turno de hora extra?');
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/cronograma/overtime/shifts?id=${shiftId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      showToast('Turno eliminado', 'success');
      const form = document.getElementById('overtime-shift-form') as HTMLFormElement | null;
      if (form) form.reset();
      (document.getElementById('overtime-shift-edit-id') as HTMLInputElement).value = '';
      document.getElementById('overtime-shift-cancel-btn')?.classList.add('hidden');
      document.getElementById('overtime-shift-delete-btn')?.classList.add('hidden');
      const submitBtn = document.getElementById('overtime-shift-submit-btn');
      if (submitBtn) submitBtn.textContent = 'Agregar Turno';
      await refreshOvertimeForWeekend(state.overtimeSelectedWeekend);
    } catch {
      showToast('Error al eliminar turno', 'error');
    }
  });
}
