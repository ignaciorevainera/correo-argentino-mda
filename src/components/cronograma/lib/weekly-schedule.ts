import { state } from './state';
import { saveWeeklySchedules } from './api';
import { formatYMD, formatTimeInput, formatScheduleInput } from './utils';
import { OperatorStatus } from './types';
import { showToast, showConfirm, showPrompt } from './notifications';

export let currentWeeklyScheme: Record<string, OperatorStatus> = { Lunes: OperatorStatus.Franco, Martes: OperatorStatus.Franco, Miercoles: OperatorStatus.Franco, Jueves: OperatorStatus.Franco, Viernes: OperatorStatus.Franco, Sabado: OperatorStatus.Franco, Domingo: OperatorStatus.Franco };
export let currentWeeklyScheduleTimes: Record<string, string> = { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "", Sabado: "", Domingo: "" };
export let currentWeeklyBreakInicioTimes: Record<string, string> = { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "", Sabado: "", Domingo: "" };
export let currentWeeklyBreakFinTimes: Record<string, string> = { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "", Sabado: "", Domingo: "" };

export const daysName = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

export function setCurrentWeeklyData(
  scheme: Record<string, OperatorStatus>,
  scheduleTimes: Record<string, string>,
  breakInicio: Record<string, string>,
  breakFin: Record<string, string>
) {
  currentWeeklyScheme = { ...scheme };
  currentWeeklyScheduleTimes = { ...scheduleTimes };
  currentWeeklyBreakInicioTimes = { ...breakInicio };
  currentWeeklyBreakFinTimes = { ...breakFin };
}

export function populateWeeklyTemplatesDropdown() {
  const select = document.getElementById('weekly-template-select') as HTMLSelectElement | null;
  if (!select) return;
  
  const prevVal = select.value;
  let html = '<option value="">-- Seleccionar una plantilla o personalizar --</option>';
  const templates = state.weeklyTemplates;
  Object.keys(templates).forEach(name => {
    html += `<option value="${name}">${name}</option>`;
  });
  select.innerHTML = html;
  
  if (templates[prevVal]) {
    select.value = prevVal;
  } else {
    select.value = "";
  }
}

export function renderWeeklyDaysList() {
  const container = document.getElementById('weekly-days-list');
  if (!container) return;
  
  container.innerHTML = daysName.map(day => {
    const currentVal = currentWeeklyScheme[day] || "Franco";
    const currentTime = currentWeeklyScheduleTimes[day] || "";
    const currentBreakInicio = currentWeeklyBreakInicioTimes[day] || "";
    const currentBreakFin = currentWeeklyBreakFinTimes[day] || "";
    const options = ["Presencial", "Home Office", "Vacaciones", "Licencia", "Horas Extras", "Franco", "Guardia Pasiva", "Guardia"];
    
    const optHtml = options.map(opt => {
      let label = '';
      if (opt === 'Presencial') label = 'P';
      else if (opt === 'Home Office') label = 'HO';
      else if (opt === 'Vacaciones') label = 'V';
      else if (opt === 'Licencia') label = 'L';
      else if (opt === 'Horas Extras') label = 'HE';
      else if (opt === 'Franco') label = 'F';
      else if (opt === 'Guardia Pasiva') label = 'GP';
      else if (opt === 'Guardia') label = 'G';
      
      let btnClass = "weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-base-100 hover:bg-base-200 text-base-content/60 border border-base-300/40";
      if (currentVal === opt) {
        if (opt === 'Presencial') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-secondary text-secondary-content shadow-md';
        else if (opt === 'Home Office') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-amber-500 text-white shadow-md';
        else if (opt === 'Vacaciones') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-success text-white shadow-md';
        else if (opt === 'Licencia') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-error text-white shadow-md';
        else if (opt === 'Horas Extras') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-sky-500 text-white shadow-md';
        else if (opt === 'Franco') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-base-300 text-base-content shadow-md';
        else if (opt === 'Guardia Pasiva') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-teal-500 text-white shadow-md';
        else if (opt === 'Guardia') btnClass = 'weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-indigo-500 text-white shadow-md';
      }
      
      return `<button type="button" class="${btnClass}" data-weekly-option="${opt}">${label}</button>`;
    }).join('');
    
    return `
      <div class="flex flex-col p-4 bg-base-200/20 border border-base-300/30 rounded-2xl gap-3.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-start gap-4">
            <span class="text-xs font-bold text-base-content/70 min-w-16">${day}</span>
            <input 
              type="text" 
              class="weekly-schedule-input input input-xs input-bordered w-32 font-mono font-bold text-[11px] bg-base-100 focus:outline-none focus:border-secondary" 
              data-day="${day}" 
              value="${currentTime}" 
              placeholder="08:00 - 17:00" 
            />
          </div>
          <div class="flex gap-1.5 justify-end" data-weekly-day="${day}">
            ${optHtml}
          </div>
        </div>
        
        <div class="flex items-center gap-4 pl-20 border-t border-dashed border-base-300/40 pt-2.5">
          <span class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Break:</span>
          <div class="flex items-center gap-2">
            <span class="text-[8px] font-black uppercase text-base-content/30">Inicio</span>
            <input 
              type="text" 
              class="weekly-break-inicio-input input input-xs input-bordered w-16 font-mono text-[10px] font-bold text-center bg-base-100 focus:outline-none focus:border-secondary" 
              data-day="${day}" 
              value="${currentBreakInicio}" 
              placeholder="HH:MM" 
              maxlength="5"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[8px] font-black uppercase text-base-content/30">Fin</span>
            <input 
              type="text" 
              class="weekly-break-fin-input input input-xs input-bordered w-16 font-mono text-[10px] font-bold text-center bg-base-100 focus:outline-none focus:border-secondary" 
              data-day="${day}" 
              value="${currentBreakFin}" 
              placeholder="HH:MM" 
              maxlength="5"
            />
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function handleTemplateSelectChange(name: string) {
  const customActions = document.getElementById('template-custom-actions');
  const templates = state.weeklyTemplates;
  
  if (name && templates[name]) {
    currentWeeklyScheme = { ...templates[name].dias };
    currentWeeklyScheduleTimes = { ...templates[name].horarios };
    currentWeeklyBreakInicioTimes = { ...(templates[name].breaks_inicio || { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "", Sabado: "", Domingo: "" }) };
    currentWeeklyBreakFinTimes = { ...(templates[name].breaks_fin || { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "", Sabado: "", Domingo: "" }) };
    renderWeeklyDaysList();
    
    if (customActions) {
      customActions.classList.remove('hidden');
      const nameInput = document.getElementById('new-template-name') as HTMLInputElement | null;
      if (nameInput) nameInput.value = name;
    }
  } else {
    if (customActions) customActions.classList.add('hidden');
  }
}

export function handleCreateTemplateClick() {
  const customActions = document.getElementById('template-custom-actions');
  if (customActions) {
    customActions.classList.remove('hidden');
    const nameInput = document.getElementById('new-template-name') as HTMLInputElement | null;
    if (nameInput) {
      nameInput.value = "";
      nameInput.focus();
    }
  }
}

export function handleSaveTemplateClick() {
  const nameInput = document.getElementById('new-template-name') as HTMLInputElement | null;
  const name = nameInput?.value?.trim();
  if (!name) {
    showToast("Por favor, ingresa un nombre para la plantilla.", "warning");
    return;
  }
  
  const templates = state.weeklyTemplates;
  templates[name] = {
    dias: { ...currentWeeklyScheme },
    horarios: { ...currentWeeklyScheduleTimes },
    breaks_inicio: { ...currentWeeklyBreakInicioTimes },
    breaks_fin: { ...currentWeeklyBreakFinTimes }
  };
  state.weeklyTemplates = templates;
  
  populateWeeklyTemplatesDropdown();
  const select = document.getElementById('weekly-template-select') as HTMLSelectElement | null;
  if (select) select.value = name;
  
  showToast(`¡Plantilla "${name}" guardada con éxito!`, "success");
}

export async function handleDeleteTemplateClick() {
  const select = document.getElementById('weekly-template-select') as HTMLSelectElement | null;
  const name = select?.value;
  const templates = state.weeklyTemplates;
  if (!name || !templates[name]) {
    showToast("Selecciona una plantilla válida para eliminar.", "warning");
    return;
  }
  
  const confirmed = await showConfirm(`¿Estás seguro de que deseas eliminar la plantilla "${name}"?`);
  if (confirmed) {
    delete templates[name];
    state.weeklyTemplates = templates;
    
    populateWeeklyTemplatesDropdown();
    document.getElementById('template-custom-actions')?.classList.add('hidden');
    showToast(`Plantilla "${name}" eliminada.`, "success");
  }
}

export async function handleDuplicateTemplateClick() {
  const select = document.getElementById('weekly-template-select') as HTMLSelectElement | null;
  const name = select?.value;
  const templates = state.weeklyTemplates;
  if (!name || !templates[name]) {
    showToast("Selecciona una plantilla para duplicar.", "warning");
    return;
  }
  
  const newName = await showPrompt("Ingresa el nombre del duplicado:", `${name} (Copia)`);
  if (!newName || !newName.trim()) return;
  
  templates[newName.trim()] = { ...templates[name] };
  state.weeklyTemplates = templates;
  
  populateWeeklyTemplatesDropdown();
  if (select) select.value = newName.trim();
  
  select?.dispatchEvent(new Event('change'));
  showToast(`¡Plantilla duplicada como "${newName.trim()}"!`, "success");
}

export function handleWeeklyInput(target: HTMLInputElement) {
  if (target.classList.contains('weekly-schedule-input')) {
    const day = target.getAttribute('data-day');
    if (day) {
      currentWeeklyScheduleTimes[day] = target.value;
    }
  }
  if (target.classList.contains('weekly-break-inicio-input')) {
    const day = target.getAttribute('data-day');
    if (day) {
      currentWeeklyBreakInicioTimes[day] = target.value;
    }
  }
  if (target.classList.contains('weekly-break-fin-input')) {
    const day = target.getAttribute('data-day');
    if (day) {
      currentWeeklyBreakFinTimes[day] = target.value;
    }
  }
}

export function handleWeeklyFocusOut(target: HTMLInputElement) {
  if (target.classList.contains('weekly-break-inicio-input') || target.classList.contains('weekly-break-fin-input')) {
    const formatted = formatTimeInput(target.value);
    target.value = formatted;
    const day = target.getAttribute('data-day');
    if (day) {
      if (target.classList.contains('weekly-break-inicio-input')) {
        currentWeeklyBreakInicioTimes[day] = formatted;
      } else {
        currentWeeklyBreakFinTimes[day] = formatted;
      }
    }
  }
  if (target.classList.contains('weekly-schedule-input')) {
    const formatted = formatScheduleInput(target.value);
    target.value = formatted;
    const day = target.getAttribute('data-day');
    if (day) {
      currentWeeklyScheduleTimes[day] = formatted;
    }
  }
}

export function handleWeeklyDayOptionClick(btn: HTMLButtonElement) {
  const day = btn.parentElement?.dataset.weeklyDay;
  const option = btn.dataset.weeklyOption;
  if (!day || !option) return;
  
  currentWeeklyScheme[day] = option as OperatorStatus;
  
  if (btn.parentElement) {
    btn.parentElement.querySelectorAll('[data-weekly-option]').forEach(other => {
      other.className = "weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 bg-base-100 hover:bg-base-200 text-base-content/60 border border-base-300/40";
    });
  }
  
  let activeClass = '';
  if (option === 'Presencial') activeClass = 'bg-secondary text-secondary-content shadow-md';
  else if (option === 'Home Office') activeClass = 'bg-amber-500 text-white shadow-md';
  else if (option === 'Vacaciones') activeClass = 'bg-success text-white shadow-md';
  else if (option === 'Licencia') activeClass = 'bg-error text-white shadow-md';
  else if (option === 'Horas Extras') activeClass = 'bg-sky-500 text-white shadow-md';
  else if (option === 'Franco') activeClass = 'bg-base-300 text-base-content shadow-md';
  else if (option === 'Guardia Pasiva') activeClass = 'bg-teal-500 text-white shadow-md';
  else if (option === 'Guardia') activeClass = 'bg-indigo-500 text-white shadow-md';
  
  btn.className = `weekly-day-opt-btn btn btn-xs font-black text-[9px] uppercase px-3 py-1.5 h-auto rounded-lg transition-all duration-200 ${activeClass}`;
}

export async function saveWeeklySchedule(opName: string, saveBtn: HTMLButtonElement | null) {
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = "Guardando...";
  }
  
  try {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    const activeDateStr = dateInput?.value || formatYMD(new Date());
    const [yearStr, monthStr] = activeDateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPrefix = `${yearStr}-${monthStr}`;
    const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

    const edits = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const dateObj = new Date(year, month, d);
      const dayName = dayNames[dateObj.getDay()];

      const status = currentWeeklyScheme[dayName] || "Franco";
      let horario = "";
      if (currentWeeklyScheduleTimes[dayName]) {
        horario = currentWeeklyScheduleTimes[dayName];
      } else if (status !== "Franco") {
        const op = state.cronoData.find(o => o.nombre === opName);
        horario = op?.horario || "08:00 - 17:00";
      }

      const breakInicio = currentWeeklyBreakInicioTimes[dayName] || "";
      const breakFin = currentWeeklyBreakFinTimes[dayName] || "";

      edits.push({
        agentName: opName,
        date: dateStr,
        status,
        comment: "",
        horario,
        breakInicio,
        breakFin
      });
    }

    await saveWeeklySchedules([{
      agentName: opName,
      esquema_semanal: currentWeeklyScheme,
      esquema_horario: currentWeeklyScheduleTimes,
      esquema_break_inicio: currentWeeklyBreakInicioTimes,
      esquema_break_fin: currentWeeklyBreakFinTimes
    }], edits);
    
    const opIndex = state.cronoData.findIndex(o => o.nombre === opName);
    if (opIndex !== -1) {
      state.cronoData[opIndex].esquema_semanal = { ...currentWeeklyScheme };
      state.cronoData[opIndex].esquema_horario = { ...currentWeeklyScheduleTimes };
      state.cronoData[opIndex].esquema_break_inicio = { ...currentWeeklyBreakInicioTimes };
      state.cronoData[opIndex].esquema_break_fin = { ...currentWeeklyBreakFinTimes };
    }
    
    showToast("¡Esquema semanal guardado y aplicado con éxito al mes activo!", "success");
    document.dispatchEvent(new CustomEvent('cronograma:data-changed'));
  } catch (err: unknown) {
    console.error("Error saving weekly schedule:", err);
    showToast("Ocurrió un error al intentar guardar el esquema semanal.", "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = "Aplicar Esquema a Operador";
    }
  }
}
