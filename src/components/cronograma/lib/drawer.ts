import { state } from './state';
import { saveLocation, saveOperatorRules, fetchNotes } from './api';
import { getStatusStyles } from './styles';
import { escapeHtml } from './utils';
import { setCurrentWeeklyData } from './weekly-schedule';
import { OperatorStatus } from './types';

export function updateLocationButtonsUI(val: string) {
  const mgBtn = document.getElementById('btn-location-mg');
  const ppBtn = document.getElementById('btn-location-pp');
  
  if (val === 'Monte Grande') {
    mgBtn?.classList.remove('btn-ghost', 'text-base-content/60');
    mgBtn?.classList.add('btn-secondary', 'text-secondary-content', 'shadow-sm', 'shadow-secondary/15');
    
    ppBtn?.classList.remove('btn-secondary', 'text-secondary-content', 'shadow-sm', 'shadow-secondary/15');
    ppBtn?.classList.add('btn-ghost', 'text-base-content/60');
  } else {
    ppBtn?.classList.remove('btn-ghost', 'text-base-content/60');
    ppBtn?.classList.add('btn-secondary', 'text-secondary-content', 'shadow-sm', 'shadow-secondary/15');
    
    mgBtn?.classList.remove('btn-secondary', 'text-secondary-content', 'shadow-sm', 'shadow-secondary/15');
    mgBtn?.classList.add('btn-ghost', 'text-base-content/60');
  }
}

export function openDrawer(opName: string) {
  const op = state.cronoData.find(o => o.nombre === opName);
  const drawerOverlay = document.getElementById('operator-drawer-overlay');
  const drawer = document.getElementById('operator-drawer');
  const locSelect = document.getElementById('drawer-op-location') as HTMLSelectElement | null;
  if (!op || !drawerOverlay || !drawer) return;

  const drawerOpName = document.getElementById('drawer-op-name');
  if (drawerOpName) drawerOpName.innerText = op.nombre;

  if (locSelect) {
    locSelect.value = op.location || "Monte Grande";
    updateLocationButtonsUI(locSelect.value);
  }
  
  const locIndicator = document.getElementById('location-status-indicator');
  if (locIndicator) locIndicator.classList.add('opacity-0');
  
  const nameParts = op.nombre.trim().split(/\s+/);
  const initials = nameParts.length > 1 
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : nameParts[0].substring(0, 2).toUpperCase();
  const initialsEl = document.getElementById('drawer-op-avatar-initials');
  if (initialsEl) initialsEl.innerText = initials;

  const notesTextarea = document.getElementById('drawer-op-notes') as HTMLTextAreaElement | null;
  const notesIndicator = document.getElementById('notes-status-indicator');
  if (notesIndicator) notesIndicator.classList.add('opacity-0');
  if (notesTextarea) {
    notesTextarea.value = "Cargando notas...";
    notesTextarea.disabled = true;
    
    fetchNotes(op.nombre)
      .then(data => {
        notesTextarea.value = data.notes || "";
        notesTextarea.disabled = false;
      })
      .catch(err => {
        console.error("Error loading notes:", err);
        notesTextarea.value = "";
        notesTextarea.disabled = false;
      });
  }

  const emailEl = document.getElementById('drawer-op-email');
  if (emailEl) emailEl.innerText = op.username ? `${op.username}@correoargentino.com.ar` : '';

  const minPWeekSelectEl = document.getElementById('drawer-op-min-p-week') as HTMLSelectElement | null;
  const maxHoSelectEl = document.getElementById('drawer-op-max-ho') as HTMLSelectElement | null;
  if (minPWeekSelectEl) {
    minPWeekSelectEl.value = op.minPWeek !== undefined && op.minPWeek !== null ? String(op.minPWeek) : "";
  }
  if (maxHoSelectEl) {
    maxHoSelectEl.value = op.maxConsecutiveHO !== undefined && op.maxConsecutiveHO !== null ? String(op.maxConsecutiveHO) : "";
  }
  const rulesIndicatorEl = document.getElementById('rules-status-indicator');
  if (rulesIndicatorEl) {
    rulesIndicatorEl.classList.add('opacity-0');
    rulesIndicatorEl.classList.remove('opacity-100');
  }

  let p = 0, ho = 0;
  Object.values(op.asistencia || {}).forEach(s => {
    if (s === 'Presencial Monte Grande' || s === 'Presencial Parque Patricios') p++;
    else if (s === 'Home Office') ho++;
  });
  const statPEl = document.getElementById('drawer-stat-p');
  const statHoEl = document.getElementById('drawer-stat-ho');
  if (statPEl) statPEl.innerText = p.toString();
  if (statHoEl) statHoEl.innerText = ho.toString();

  // History list (Timeline)
  const historyList = document.getElementById('drawer-history-list');
  if (historyList) {
    const sortedDates = Object.keys(op.asistencia || {}).sort().reverse();
    historyList.innerHTML = sortedDates.map(date => {
      const status = op.asistencia[date];
      const styles = getStatusStyles(status);
      
      const dateObj = new Date(date + 'T12:00:00');
      const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(dateObj);
      const dayMonth = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(dateObj);
      const displayDate = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayMonth}`;

      return `
        <div class="relative pl-6 pb-5 border-l border-base-300 last:pb-0 last:border-l-transparent flex-col">
          <div class="absolute -left-[5.5px] top-2.5 w-2.5 h-2.5 rounded-full border-2 bg-base-100 transition-colors duration-200" style="border-color: ${styles.color || 'var(--color-base-content)'}"></div>
          
          <div class="bg-base-200/30 hover:bg-base-200/60 border border-base-300/40 rounded-2xl p-3.5 transition-all duration-200 shadow-sm flex items-center justify-between gap-3">
            <span class="text-xs font-bold text-base-content/85">${displayDate}</span>
            <span class="${styles.badge} text-[9px] px-2 py-0.5 leading-none h-auto shrink-0 select-none">${status}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const opWeekly = op.esquema_semanal || { Lunes: OperatorStatus.Franco, Martes: OperatorStatus.Franco, Miercoles: OperatorStatus.Franco, Jueves: OperatorStatus.Franco, Viernes: OperatorStatus.Franco };
  const opWeeklyScheduleTimes = op.esquema_horario || { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "" };
  const opWeeklyBreakInicioTimes = op.esquema_break_inicio || { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "" };
  const opWeeklyBreakFinTimes = op.esquema_break_fin || { Lunes: "", Martes: "", Miercoles: "", Jueves: "", Viernes: "" };

  setCurrentWeeklyData(opWeekly, opWeeklyScheduleTimes, opWeeklyBreakInicioTimes, opWeeklyBreakFinTimes);

  // Reset weekly template select and hide custom actions when opening/switching operator
  const weeklySelect = document.getElementById('weekly-template-select') as HTMLSelectElement | null;
  if (weeklySelect) {
    weeklySelect.value = "";
  }
  const customActions = document.getElementById('template-custom-actions');
  if (customActions) {
    customActions.classList.add('hidden');
  }

  const tabProfileBtn = document.getElementById('tab-profile-btn');
  tabProfileBtn?.dispatchEvent(new Event('click'));

  drawerOverlay.classList.remove('hidden');
  drawerOverlay.classList.add('flex');
  
  setTimeout(() => {
    drawer.classList.add('is-active');
  }, 10);
  
  document.body.style.overflow = 'hidden';
}

export function closeDrawer() {
  const drawerOverlay = document.getElementById('operator-drawer-overlay');
  const drawer = document.getElementById('operator-drawer');
  if (!drawer || !drawerOverlay) return;
  
  drawer.classList.remove('is-active');
  setTimeout(() => {
    drawerOverlay.classList.add('hidden');
    drawerOverlay.classList.remove('flex');
    document.body.style.overflow = '';
  }, 300);
}

export async function saveDrawerLocation(val: string) {
  const opName = document.getElementById('drawer-op-name')?.textContent?.trim();
  const locIndicator = document.getElementById('location-status-indicator');
  if (!opName) return;

  if (locIndicator) {
    locIndicator.innerText = "Guardando...";
    locIndicator.classList.remove('opacity-0', 'text-success/70', 'text-error');
    locIndicator.classList.add('opacity-100', 'text-warning/70');
  }

  updateLocationButtonsUI(val);

  try {
    await saveLocation(opName, val);

    const op = state.cronoData.find(o => o.nombre === opName);
    if (op) {
      op.location = val;
    }

    if (locIndicator) {
      locIndicator.innerText = "Guardado";
      locIndicator.classList.remove('text-warning/70');
      locIndicator.classList.add('text-success/70');
      setTimeout(() => {
        if (locIndicator.innerText === "Guardado") {
          locIndicator.classList.add('opacity-0');
          locIndicator.classList.remove('opacity-100');
        }
      }, 1500);
    }
    document.dispatchEvent(new CustomEvent('cronograma:data-changed'));
  } catch (err: unknown) {
    console.error("Error saving location:", err);
    if (locIndicator) {
      locIndicator.innerText = "Error";
      locIndicator.classList.remove('text-warning/70', 'text-success/70');
      locIndicator.classList.add('text-error');
    }
  }
}

export async function saveDrawerOperatorRules(minPWeekSelectEl: HTMLSelectElement | null, maxHoSelectEl: HTMLSelectElement | null) {
  const opName = document.getElementById('drawer-op-name')?.textContent?.trim();
  const rulesIndicator = document.getElementById('rules-status-indicator');
  if (!opName || !minPWeekSelectEl || !maxHoSelectEl) return;

  if (rulesIndicator) {
    rulesIndicator.innerText = "Guardando...";
    rulesIndicator.classList.remove('opacity-0', 'text-success/70', 'text-error');
    rulesIndicator.classList.add('opacity-100', 'text-warning/70');
  }

  const valMinP = minPWeekSelectEl.value;
  const valMaxHo = maxHoSelectEl.value;
  const minPWeek = valMinP === "" ? null : parseInt(valMinP, 10);
  const maxConsecutiveHO = valMaxHo === "" ? null : parseInt(valMaxHo, 10);

  try {
    await saveOperatorRules(opName, minPWeek, maxConsecutiveHO);

    const op = state.cronoData.find(o => o.nombre === opName);
    if (op) {
      op.minPWeek = minPWeek;
      op.maxConsecutiveHO = maxConsecutiveHO;
    }

    if (rulesIndicator) {
      rulesIndicator.innerText = "Guardado";
      rulesIndicator.classList.remove('text-warning/70');
      rulesIndicator.classList.add('text-success/70');
      setTimeout(() => {
        if (rulesIndicator.innerText === "Guardado") {
          rulesIndicator.classList.add('opacity-0');
          rulesIndicator.classList.remove('opacity-100');
        }
      }, 1500);
    }
    document.dispatchEvent(new CustomEvent('cronograma:data-changed'));
  } catch (err: unknown) {
    console.error("Error saving rules:", err);
    if (rulesIndicator) {
      rulesIndicator.innerText = "Error";
      rulesIndicator.classList.remove('text-warning/70', 'text-success/70');
      rulesIndicator.classList.add('text-error');
    }
  }
}
