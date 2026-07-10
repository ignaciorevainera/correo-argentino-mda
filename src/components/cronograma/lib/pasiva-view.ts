import { state } from './state';
import { showToast } from './notifications';
import { updateViewSwitcherUI } from './dashboard-client';
import { escapeHtml } from '@lib/sanitize';

export function hasPasivaChanges(): boolean {
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

export function updatePasivaToolbarUI(): void {
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

export async function savePasivaChanges(btn: HTMLButtonElement): Promise<void> {
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

export function discardPasivaChanges(): void {
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

export function showPasivaView(): void {
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

export async function renderPasivaView(): Promise<void> {
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
    state.pasivaState.supervisors = data.supervisors || [];

    if (monthlyOperatorSelect) {
      monthlyOperatorSelect.value = data.operatorId ? String(data.operatorId) : '';
      const textEl = document.getElementById('pasiva-monthly-operator-text');
      if (textEl) {
        const selectedOpt = monthlyOperatorSelect.options[monthlyOperatorSelect.selectedIndex];
        textEl.textContent = selectedOpt ? selectedOpt.textContent : 'SIN OPERADOR';
      }
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

export function populatePasivaWeekInputs(): void {
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
    
    const container = document.getElementById('cronograma-app-container');
    const userRole = container?.dataset.userRole || 'agent';
    const isReadOnly = ['agent', 'referent'].includes(userRole);

    const tdSupervisor = document.createElement('td');
    tdSupervisor.className = 'py-2';
    if (isReadOnly) {
      const supervisorText = document.createElement('span');
      supervisorText.className = 'text-xs font-bold text-base-content/85 px-3 py-2 bg-base-200/50 rounded-xl border border-base-300 min-h-9 flex items-center w-full max-w-xs';
      supervisorText.textContent = w.supervisorName || 'SIN ASIGNAR';
      tdSupervisor.appendChild(supervisorText);
    } else {
      const supervisorSelect = document.createElement('select');
      supervisorSelect.className = 'select select-bordered select-sm font-bold text-xs h-9 w-full max-w-xs rounded-xl bg-base-100 focus:outline-none focus:border-secondary';
      
      state.pasivaState.supervisors.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        supervisorSelect.appendChild(opt);
      });
      
      if (w.supervisorName && !state.pasivaState.supervisors.includes(w.supervisorName)) {
        const opt = document.createElement('option');
        opt.value = w.supervisorName;
        opt.textContent = w.supervisorName;
        supervisorSelect.appendChild(opt);
      }
      
      supervisorSelect.value = w.supervisorName || '';
      supervisorSelect.addEventListener('change', () => {
        w.supervisorName = supervisorSelect.value;
        updatePasivaToolbarUI();
      });
      tdSupervisor.appendChild(supervisorSelect);
    }
    tr.appendChild(tdSupervisor);
    
    const tdReferente = document.createElement('td');
    tdReferente.className = 'py-2 pr-4';
    if (isReadOnly) {
      const referenteText = document.createElement('span');
      referenteText.className = 'text-xs font-bold text-base-content/85 px-3 py-2 bg-base-200/50 rounded-xl border border-base-300 min-h-9 flex items-center w-full max-w-xs';
      const selectedOp = state.cronoData.find(op => op.id === w.referenteId);
      referenteText.textContent = selectedOp ? selectedOp.nombre : 'SIN REFERENTE';
      tdReferente.appendChild(referenteText);
    } else {
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
    }
    tr.appendChild(tdReferente);
    
    tbody.appendChild(tr);
  });
}

export function setupPasivaEventListeners(): void {
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
}
