import { state } from './state';
import { formatToDDMMYY } from './rotation-helper';
import { escapeHtml } from '@lib/sanitize';

interface ShiftEntry {
  agentId: number;
  agentName: string;
  day: 'saturday' | 'sunday';
  startTime: string;
  endTime: string;
  hours: number;
}

interface WeekendGroup {
  startDate: string;
  saturdayDate: string;
  sundayDate: string;
  totalHours: number;
  operatorCount: number;
  currentUserHasShift: boolean;
  shifts: ShiftEntry[];
}

interface PreviewResponse {
  weekends: WeekendGroup[];
  currentUserId: number;
  month: string;
}

let currentMonth = '';
let currentData: PreviewResponse | null = null;
let chartInstances: any[] = [];

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MAX_WEEKEND_HOURS = 35;

function waitForChartJs(): Promise<void> {
  if ((window as any).Chart) return Promise.resolve();
  return new Promise(resolve => {
    const check = setInterval(() => {
      if ((window as any).Chart) { clearInterval(check); resolve(); }
    }, 50);
  });
}

function formatDateLabel(saturday: string, sunday: string): string {
  const sat = new Date(saturday + 'T12:00:00');
  const sun = new Date(sunday + 'T12:00:00');
  const satDay = sat.getDate();
  const sunDay = sun.getDate();
  const satMonth = sat.getMonth();
  const sunMonth = sun.getMonth();
  if (satMonth === sunMonth) {
    return `Sáb ${satDay} y Dom ${sunDay} ${MONTH_ABBR[satMonth]}`;
  }
  return `Sáb ${satDay} ${MONTH_ABBR[satMonth]} y Dom ${sunDay} ${MONTH_ABBR[sunMonth]}`;
}

function ensureModal(): HTMLDialogElement {
  let dialog = document.getElementById('overtime-preview-modal') as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'overtime-preview-modal';
    dialog.className = 'modal modal-bottom sm:modal-middle z-[200]';
    dialog.innerHTML = `
      <div class="modal-box max-w-4xl rounded-2xl border border-base-300 shadow-2xl p-0 bg-base-100 overflow-hidden">
        <div id="overtime-preview-content" class="p-6"></div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    `;
    dialog.addEventListener('close', () => {
      chartInstances.forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
      chartInstances = [];
      currentData = null;
    });
    document.body.appendChild(dialog);
  }
  return dialog;
}

function closeModal(): void {
  chartInstances.forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
  chartInstances = [];
  currentData = null;
  const dialog = document.getElementById('overtime-preview-modal') as HTMLDialogElement | null;
  if (dialog) dialog.close();
}

export function renderSkeleton(): string {
  const cards = Array.from({ length: 4 }, () => `
    <div class="bg-base-100 rounded-xl border border-base-300/60 shadow-sm p-4 flex flex-col items-center gap-2 animate-pulse">
      <div class="w-24 h-24 rounded-full bg-base-300/50"></div>
      <div class="h-3 w-32 rounded bg-base-300/50 mt-1"></div>
      <div class="h-4 w-24 rounded-full bg-base-300/50 mt-1"></div>
    </div>
  `).join('');
  return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${cards}</div>`;
}

export function renderError(): string {
  return `
    <div class="flex flex-col items-center justify-center py-12 gap-4">
      <div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <p class="text-xs font-bold text-base-content/60">Error al cargar la vista previa</p>
      <button type="button" id="preview-retry-btn" class="btn btn-sm btn-warning">Reintentar</button>
    </div>
  `;
}

function renderCard(weekend: WeekendGroup, currentUserId: number, selectedWeekend: string | null): string {
  const { saturdayDate, sundayDate, totalHours, operatorCount, currentUserHasShift, shifts } = weekend;
  const dateLabel = formatDateLabel(saturdayDate, sundayDate);
  const cardId = `overtime-card-${saturdayDate}`;

  const donutHtml = `
    <div class="relative w-24 h-24 flex items-center justify-center">
      <canvas class="overtime-preview-canvas" data-hours="${totalHours}" width="96" height="96"></canvas>
      <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span class="text-lg font-black text-base-content">${totalHours}</span>
        <span class="text-tiny font-bold text-base-content/50">hs</span>
      </div>
    </div>`;

  if (currentUserHasShift) {
    const dayLabelMap: Record<string, string> = { saturday: 'Sáb', sunday: 'Dom' };
    const userShifts = shifts.filter(s => s.agentId === currentUserId);
    const userShiftDetails = userShifts.map(s =>
      `${dayLabelMap[s.day]} ${s.startTime}-${s.endTime} (${s.hours}h)`
    ).join(', ');

    const companions = shifts
      .filter(s => s.agentId !== currentUserId)
      .reduce((acc: Map<number, string>, s) => {
        if (!acc.has(s.agentId)) {
          acc.set(s.agentId, s.agentName.split(' ')[0]);
        }
        return acc;
      }, new Map<number, string>());
    const companionsList = Array.from(companions.values()).join(', ');

    return `
      <div id="${cardId}" class="cursor-pointer bg-base-100 rounded-xl border border-base-300/60 shadow-sm hover:shadow-md hover:border-warning/30 transition-all p-4 flex flex-col items-center gap-2${totalHours === 0 ? ' opacity-40' : ''}${saturdayDate === selectedWeekend ? ' ring-2 ring-warning' : ''}">
        ${donutHtml}
        <span class="text-xxs font-black uppercase tracking-wider text-base-content/70">${escapeHtml(dateLabel)}</span>
        <span class="badge badge-sm badge-success gap-1 text-xxs font-black"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>ESTÁS ASIGNADO</span>
        <div class="text-xxs text-base-content/70 text-center leading-tight">${escapeHtml(userShiftDetails)}</div>
        ${companionsList ? `<div class="text-xxs text-base-content/50 text-center">Compañeros: ${escapeHtml(companionsList)}</div>` : ''}
        <div class="w-full flex justify-end">
          <span class="text-tiny font-bold text-base-content/40">Total: ${totalHours} hs</span>
        </div>
      </div>`;
  }

  return `
    <div id="${cardId}" class="cursor-pointer bg-base-100 rounded-xl border border-base-300/60 shadow-sm hover:shadow-md hover:border-warning/30 transition-all p-4 flex flex-col items-center gap-2${totalHours === 0 ? ' opacity-40' : ''}${saturdayDate === selectedWeekend ? ' ring-2 ring-warning' : ''}">
      ${donutHtml}
      <span class="text-xxs font-black uppercase tracking-wider text-base-content/70">${escapeHtml(dateLabel)}</span>
      <span class="badge badge-sm badge-ghost text-xxs font-black text-base-content/50">FIN DE SEMANA LIBRE</span>
      <span class="text-tiny font-semibold text-base-content/60">${operatorCount} operador${operatorCount !== 1 ? 'es' : ''}</span>
    </div>`;
}

function generateMonthItems(currentYear: number, currentMonth: number): string {
  let html = '';
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      const selected = y === currentYear && m === currentMonth;
      html += `<li><a class="${selected ? 'active font-black' : ''}" data-month="${y}-${String(m).padStart(2, '0')}">${MONTH_NAMES[m - 1]} ${y}</a></li>`;
    }
  }
  return html;
}

export function renderPreview(data: PreviewResponse): void {
  currentData = data;
  const content = document.getElementById('overtime-preview-content');
  if (!content) return;

  const [year, monthNum] = data.month.split('-').map(Number);
  const monthName = MONTH_NAMES[monthNum - 1];
  const weekendCount = data.weekends.length;

  let cardsHtml: string;
  if (weekendCount === 0) {
    cardsHtml = `
      <div class="col-span-full flex flex-col items-center justify-center py-12 text-base-content/30">
        <svg class="w-10 h-10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p class="text-xs font-bold uppercase tracking-wider">Sin fines de semana con horas extras</p>
      </div>`;
  } else {
    cardsHtml = data.weekends.map(w => renderCard(w, data.currentUserId, state.overtimeSelectedWeekend)).join('');
  }

  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <button type="button" id="preview-prev-month" class="btn btn-xs btn-ghost">‹</button>
        <div class="dropdown dropdown-bottom">
          <div tabindex="0" role="button" id="preview-month-trigger" class="text-sm font-black uppercase tracking-wider text-base-content cursor-pointer select-none flex items-center gap-1">
            ${escapeHtml(monthName)} ${year}
            <svg class="w-3.5 h-3.5 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <ul tabindex="0" id="preview-month-menu" class="dropdown-content menu menu-xs flex-nowrap bg-base-100 rounded-xl border border-base-300 shadow-xl z-[1] w-48 max-h-64 overflow-y-auto mt-1 p-1">
            ${generateMonthItems(year, monthNum)}
          </ul>
        </div>
        <button type="button" id="preview-next-month" class="btn btn-xs btn-ghost">›</button>
      </div>
      <div class="flex items-center gap-2">
        <div class="text-xxs font-bold text-base-content/40">${weekendCount} findes con HE</div>
        <button type="button" id="preview-close-btn" class="btn btn-xs btn-ghost btn-square" aria-label="Cerrar">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${cardsHtml}</div>
  `;

  document.getElementById('preview-prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('preview-next-month')?.addEventListener('click', () => navigateMonth(1));
  document.getElementById('preview-month-menu')?.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || !a.dataset.month) return;
    (a.closest('.dropdown')?.querySelector('[tabindex="0"]') as HTMLElement)?.focus();
    openOvertimePreview(a.dataset.month);
  });
  document.getElementById('preview-close-btn')?.addEventListener('click', closeModal);

  data.weekends.forEach(w => {
    const card = document.getElementById(`overtime-card-${w.saturdayDate}`);
    card?.addEventListener('click', () => selectWeekendFromCard(w.saturdayDate));
  });

  initCharts();
}

export function initCharts(): void {
  chartInstances.forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
  chartInstances = [];

  const canvases = document.querySelectorAll<HTMLCanvasElement>('.overtime-preview-canvas');
  if (canvases.length === 0) return;
  if (!(window as any).Chart) {
    setTimeout(initCharts, 100);
    return;
  }

  const Chart = (window as any).Chart;
  canvases.forEach(canvas => {
    const totalHours = parseFloat(canvas.dataset.hours || '0');
    const filled = Math.min(totalHours, MAX_WEEKEND_HOURS);
    const remaining = MAX_WEEKEND_HOURS - filled;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [filled, remaining],
          backgroundColor: ['#f59e0b', 'rgba(0,0,0,0.05)'],
          borderWidth: 0,
        }]
      },
      options: {
        cutout: '78%',
        responsive: false,
        plugins: { tooltip: { enabled: false }, legend: { display: false } }
      }
    });
    chartInstances.push(chart);
  });
}

export function navigateMonth(delta: 1 | -1): void {
  if (!currentMonth) return;
  const [year, month] = currentMonth.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  openOvertimePreview(currentMonth);
}

export async function selectWeekendFromCard(saturday: string): Promise<void> {
  closeModal();
  state.overtimeSelectedWeekend = saturday;
  const { refreshOvertimeForWeekend } = await import('./overtime-view');
  refreshOvertimeForWeekend(saturday);
}

export async function openOvertimePreview(month?: string): Promise<void> {
  chartInstances.forEach(c => { if (c && typeof c.destroy === 'function') c.destroy(); });
  chartInstances = [];

  if (month) {
    currentMonth = month;
  } else {
    if (state.overtimeSelectedWeekend) {
      currentMonth = state.overtimeSelectedWeekend.slice(0, 7);
    } else {
      currentMonth = new Date().toISOString().slice(0, 7);
    }
  }

  const dialog = ensureModal();
  const content = document.getElementById('overtime-preview-content');
  if (content) content.innerHTML = renderSkeleton();
  dialog.showModal();

  try {
    const res = await fetch(`/api/cronograma/overtime/preview?month=${currentMonth}`);
    if (!res.ok) throw new Error('Error al cargar');
    const data: PreviewResponse = await res.json();
    renderPreview(data);
  } catch (err) {
    console.error('Overtime preview error:', err);
    if (content) content.innerHTML = renderError();
    document.getElementById('preview-retry-btn')?.addEventListener('click', () => openOvertimePreview(currentMonth));
  }
}
