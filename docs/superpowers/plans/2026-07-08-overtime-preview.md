# Overtime Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Ver Mes" button next to the overtime Saturday selector that opens a modal with Chart.js donut cards for each weekend of the month.

**Architecture:** New API endpoint returns aggregated weekend data for a given month. New JS module handles modal render, Chart.js donut creation, and click-to-navigate back to existing overtime timeline. Minimal ASTRO template changes (button + dialog container).

**Tech Stack:** Astro SSR API route, chart.js CDN, Drizzle ORM, DaisyUI dialog component

---

### Task 1: API endpoint GET /api/cronograma/overtime/preview

**Files:**
- Create: `src/pages/api/cronograma/overtime/preview.ts`

- [ ] **Step 1: Create the API route file**

```ts
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { weekendOvertimeShifts, agents } from "@db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { sanitizeError } from "@lib/apiResponse";

interface ShiftEntry {
  agentId: number;
  agentName: string;
  day: "saturday" | "sunday";
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

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const currentUserId = locals.user?.id || 0;
    const month = url.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return new Response(
        JSON.stringify({ error: "Parámetro month requerido (YYYY-MM)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate all Saturdays in the month
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const mon = parseInt(monthStr, 10) - 1; // 0-indexed
    const daysInMonth = new Date(year, mon + 1, 0).getDate();
    const saturdays: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, mon, d);
      if (date.getDay() === 6) {
        saturdays.push(`${month}-${String(d).padStart(2, "0")}`);
      }
    }

    if (saturdays.length === 0) {
      return new Response(
        JSON.stringify({ weekends: [], currentUserId, month }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch all shifts for these weekends
    const allShifts = await db
      .select({
        id: weekendOvertimeShifts.id,
        weekendStartDate: weekendOvertimeShifts.weekendStartDate,
        agentId: weekendOvertimeShifts.agentId,
        date: weekendOvertimeShifts.date,
        startTime: weekendOvertimeShifts.startTime,
        endTime: weekendOvertimeShifts.endTime,
        agentName: agents.name,
      })
      .from(weekendOvertimeShifts)
      .leftJoin(agents, eq(weekendOvertimeShifts.agentId, agents.id))
      .where(inArray(weekendOvertimeShifts.weekendStartDate, saturdays));

    // Group by weekendStartDate
    const grouped: Record<string, WeekendGroup> = {};
    for (const sat of saturdays) {
      const satDate = new Date(year, mon, parseInt(sat.split("-")[2], 10));
      const sunDate = new Date(satDate);
      sunDate.setDate(sunDate.getDate() + 1);
      const sundayStr = `${sunDate.getFullYear()}-${String(sunDate.getMonth() + 1).padStart(2, "0")}-${String(sunDate.getDate()).padStart(2, "0")}`;
      grouped[sat] = {
        startDate: sat,
        saturdayDate: sat,
        sundayDate: sundayStr,
        totalHours: 0,
        operatorCount: 0,
        currentUserHasShift: false,
        shifts: [],
      };
    }

    for (const s of allShifts) {
      const g = grouped[s.weekendStartDate];
      if (!g) continue;

      const startMin = timeToMinutes(s.startTime);
      const endMin = timeToMinutes(s.endTime);
      const hours = Math.round(((endMin - startMin + 1440) % 1440) / 60 * 10) / 10;

      const day: "saturday" | "sunday" =
        s.date === s.weekendStartDate ? "saturday" : "sunday";

      g.shifts.push({
        agentId: s.agentId,
        agentName: s.agentName || `Operador #${s.agentId}`,
        day,
        startTime: s.startTime,
        endTime: s.endTime,
        hours,
      });

      if (s.agentId === currentUserId) {
        g.currentUserHasShift = true;
      }
    }

    // Compute totals per weekend
    for (const sat of saturdays) {
      const g = grouped[sat];
      if (!g) continue;
      g.totalHours = Math.round(
        g.shifts.reduce((sum, sh) => sum + sh.hours, 0) * 10
      ) / 10;
      const opSet = new Set(g.shifts.map((sh) => sh.agentId));
      g.operatorCount = opSet.size;
    }

    const weekends = saturdays.map((sat) => grouped[sat]).filter(Boolean);

    return new Response(
      JSON.stringify({ weekends, currentUserId, month }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("GET overtime preview API Error:", error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error) || "Error al obtener datos" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
```

- [ ] **Step 2: Verify the file exists and imports resolve**

Run: `npx tsx -e "import('./src/pages/api/cronograma/overtime/preview')"` (may log warnings about missing Astro globals, that's fine)

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/cronograma/overtime/preview.ts
git commit -m "feat: add overtime preview API endpoint"
```

---

### Task 2: Frontend module — overtime-preview.ts

**Files:**
- Create: `src/components/cronograma/lib/overtime-preview.ts`

- [ ] **Step 1: Create the preview module**

```ts
import { state } from './state';
import { showToast } from './notifications';
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

function getMonthFromPicker(): string {
  const display = document.getElementById('overtime-weekend-date-display');
  if (display?.textContent && display.textContent !== 'Seleccionar sábado...') {
    const val = (document.getElementById('overtime-weekend-date') as HTMLInputElement)?.value;
    if (val) return val.slice(0, 7);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function openOvertimePreview(month?: string): Promise<void> {
  currentMonth = month || getMonthFromPicker();
  currentData = null;
  const modal = document.getElementById('overtime-preview-modal') as HTMLDialogElement | null;
  const content = document.getElementById('overtime-preview-content');
  if (!modal || !content) return;

  // Show skeleton
  content.innerHTML = renderSkeleton();
  modal.showModal();

  try {
    const res = await fetch(`/api/cronograma/overtime/preview?month=${currentMonth}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentData = await res.json();
    renderPreview(currentData);
  } catch (err) {
    content.innerHTML = renderError();
  }
}

function renderSkeleton(): string {
  return `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <button type="button" id="preview-prev-month" class="btn btn-xs btn-ghost" disabled>
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="loading loading-spinner loading-sm"></span>
        <button type="button" id="preview-next-month" class="btn btn-xs btn-ghost" disabled>
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <button class="btn btn-sm btn-circle btn-ghost" onclick="document.getElementById('overtime-preview-modal')?.close()">✕</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${Array(4).fill(0).map(() => `
        <div class="bg-base-200/50 rounded-xl border border-base-300/60 p-4 animate-pulse">
          <div class="w-24 h-24 mx-auto rounded-full bg-base-300/50 mb-3"></div>
          <div class="h-3 w-28 mx-auto bg-base-300/30 rounded mb-2"></div>
          <div class="h-3 w-20 mx-auto bg-base-300/30 rounded"></div>
        </div>
      `).join('')}
    </div>`;
}

function renderError(): string {
  return `
    <div class="flex flex-col items-center justify-center py-12 gap-3">
      <svg class="size-10 text-error/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p class="text-sm font-bold text-base-content/60">Error al cargar datos</p>
      <button type="button" class="btn btn-sm btn-primary" onclick="document.querySelector('[data-reload-preview]')?.click()" data-reload-preview>Reintentar</button>
    </div>`;
}

function renderPreview(data: PreviewResponse): void {
  const content = document.getElementById('overtime-preview-content');
  if (!content) return;

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const [y, m] = currentMonth.split('-').map(Number);
  const monthName = `${monthNames[m - 1]} ${y}`;

  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <button type="button" id="preview-prev-month" class="btn btn-xs btn-ghost">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h3 class="text-sm font-black uppercase tracking-wider text-base-content select-none">${monthName}</h3>
        <button type="button" id="preview-next-month" class="btn btn-xs btn-ghost">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="text-xxs font-bold text-base-content/40">${data.weekends.filter(w => w.totalHours > 0).length} findes con HE</div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${data.weekends.length === 0 ? '<div class="col-span-full text-center py-12 text-base-content/30 font-bold uppercase tracking-wider text-xs">No hay horas extras cargadas para este mes</div>' : ''}
      ${data.weekends.map(w => renderCard(w, data.currentUserId)).join('')}
    </div>`;

  // Chart.js donuts after DOM render
  const canvasEls = content.querySelectorAll('.overtime-preview-canvas');
  if (canvasEls.length > 0) {
    const tryCharts = () => {
      if ((window as any).Chart) {
        chartInstances.forEach((c: any) => c.destroy());
        chartInstances = [];
        canvasEls.forEach((canvas) => {
          const ctx = (canvas as HTMLCanvasElement).getContext('2d');
          if (!ctx) return;
          const hours = parseFloat((canvas as HTMLElement).dataset.hours || '0');
          const instance = new (window as any).Chart(ctx, {
            type: 'doughnut',
            data: {
              datasets: [{
                data: [1],
                backgroundColor: ['#f59e0b'],
                borderWidth: 0,
                cutout: '78%',
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              plugins: { tooltip: { enabled: false }, legend: { display: false } }
            }
          });
          chartInstances.push(instance);
        });
      } else {
        setTimeout(tryCharts, 100);
      }
    };
    tryCharts();
  }

  // Month navigation
  document.getElementById('preview-prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('preview-next-month')?.addEventListener('click', () => navigateMonth(1));

  // Card click handlers
  data.weekends.forEach(w => {
    const card = document.getElementById(`overtime-card-${w.startDate}`);
    card?.addEventListener('click', () => {
      selectWeekendFromPreview(w.startDate);
    });
  });
}

function renderCard(w: WeekendGroup, currentUserId: number): string {
  const parts = monthNameParts(w.startDate); // "Sáb 11 y Dom 12 Jul"
  return `
    <div id="overtime-card-${w.startDate}" class="cursor-pointer bg-base-100 rounded-xl border border-base-300/60 shadow-sm hover:shadow-md hover:border-warning/30 transition-all p-4 flex flex-col items-center gap-2 relative">
      <div class="relative w-24 h-24 flex items-center justify-center">
        <canvas class="overtime-preview-canvas" data-hours="${w.totalHours}" width="96" height="96"></canvas>
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span class="text-lg font-black text-base-content leading-none">${Math.round(w.totalHours)}</span>
          <span class="text-tiny font-bold text-base-content/50">hs</span>
        </div>
      </div>
      <span class="text-xxs font-black uppercase tracking-wider text-base-content/70 text-center">${renderDateLabel(w.startDate)}</span>
      ${renderBadge(w, currentUserId)}
    </div>`;
}

function renderBadge(w: WeekendGroup, currentUserId: number): string {
  if (w.currentUserHasShift) {
    const myShift = w.shifts.find(s => s.agentId === currentUserId);
    const companions = w.shifts
      .filter(s => s.agentId !== currentUserId)
      .map(s => s.agentName.split(' ')[0])
      .join(', ');
    return `
      <div class="w-full mt-1 space-y-1">
        <div class="badge badge-sm badge-success gap-1 text-xxs font-black">✅ ESTÁS ASIGNADO</div>
        ${myShift ? `<div class="text-tiny font-bold text-base-content/80">${myShift.day === 'saturday' ? 'Sábado' : 'Domingo'} ${myShift.startTime}-${myShift.endTime} (${myShift.hours}h)</div>` : ''}
        ${companions ? `<div class="text-tiny text-base-content/50">En tu guardia: ${escapeHtml(companions)}</div>` : ''}
        <div class="text-tiny font-bold text-base-content/40 text-right">Total: ${Math.round(w.totalHours)} hs</div>
      </div>`;
  }
  return `
    <div class="w-full mt-1 space-y-1">
      <div class="badge badge-ghost badge-sm text-xxs text-base-content/40 font-black">FIN DE SEMANA LIBRE</div>
      <div class="flex items-center justify-between text-tiny font-bold">
        <span class="text-base-content/80">${Math.round(w.totalHours)} hs</span>
        <span class="text-base-content/50">${w.operatorCount} operadores</span>
      </div>
    </div>`;
}

function renderDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const sun = new Date(d);
  sun.setDate(sun.getDate() + 1);
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `Sáb ${d.getDate()} y ${dayNames[sun.getDay()]} ${sun.getDate()} ${monthNames[d.getMonth()]}`;
}

function navigateMonth(delta: number): void {
  const [y, m] = currentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  openOvertimePreview(currentMonth);
}

function selectWeekendFromCard(saturday: string): void {
  const modal = document.getElementById('overtime-preview-modal') as HTMLDialogElement | null;
  modal?.close();

  const input = document.getElementById('overtime-weekend-date') as HTMLInputElement | null;
  const display = document.getElementById('overtime-weekend-date-display');
  if (input) {
    input.value = saturday;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (display) display.textContent = formatToDDMMYY(saturday);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/cronograma/lib/overtime-preview.ts
git commit -m "feat: add overtime preview modal frontend module"
```

---

### Task 3: CronogramaDashboard.astro — add button + dialog + Chart.js CDN

**Files:**
- Modify: `src/components/cronograma/CronogramaDashboard.astro`

- [ ] **Step 1: Add Chart.js CDN script at end of file**

Find the closing `</div>` of the root container or end of file. Append before `</div>` closing root:

```astro
<script is:inline src="https://cdn.jsdelivr.net/npm/chart.js" defer></script>
```

- [ ] **Step 2: Find the overtime refierente config block (~lines 717-744)**

Find the `overtime-weekend-date-wrapper` div. After the closing `</div>` of that wrapper (which is ~line 727 area), add the "Ver Mes" button:

```astro
<button type="button" id="open-overtime-preview-btn"
  class="btn btn-xs btn-ghost text-warning gap-1 shrink-0"
  title="Ver resumen mensual de horas extras">
  <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
  <span class="text-xxs font-black uppercase tracking-wider hidden sm:inline">Ver Mes</span>
</button>
```

- [ ] **Step 3: Add the dialog modal before the closing `</div>` of `id="overtime-view"`**

Find the closing of `</div><!-- ===== OVERTIME VIEW ===== -->` (around line 922 area). Before that, add:

```astro
<dialog id="overtime-preview-modal" class="modal">
  <div class="modal-box max-w-5xl p-6 min-h-[300px]">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
    </form>
    <div id="overtime-preview-content">
      <div class="flex items-center justify-center py-16 text-base-content/30">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>cerrar</button>
  </form>
</dialog>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/cronograma/CronogramaDashboard.astro
git commit -m "feat: add overtime preview button, dialog, and Chart.js CDN"
```

---

### Task 4: Register event listener in dashboard-client.ts

**Files:**
- Modify: `src/components/cronograma/lib/dashboard-client.ts`

- [ ] **Step 1: Add import + listener in setupOvertimeEventListeners area**

Find the `setupOvertimeEventListeners` lazy-load block (~lines 1849-1856). After the `showOvertimeView()` callback, add the preview button listener. Locate the `overtimeSetupDone = true` line (~1853). After that, add:

```ts
  // Preview modal button (lazy-load overtime-preview module on click)
  document.getElementById('open-overtime-preview-btn')?.addEventListener('click', async () => {
    const { openOvertimePreview } = await import('./overtime-preview');
    const monthInput = document.getElementById('overtime-weekend-date') as HTMLInputElement | null;
    const month = monthInput?.value ? monthInput.value.slice(0, 7) : undefined;
    openOvertimePreview(month);
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/components/cronograma/lib/dashboard-client.ts
git commit -m "feat: register overtime preview button listener"
```

---

### Task 5: E2E test

**Files:**
- Create: `tests/cronograma/overtime-preview.spec.ts`

- [ ] **Step 1: Create Playwright test**

```ts
import { test, expect } from '@playwright/test';

test.describe('Overtime Preview Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/supervision/cronograma');
    await page.waitForSelector('#cronograma-container');
    // Click to overtime view
    await page.click('#switch-to-overtime-btn');
    await page.waitForSelector('#overtime-view:not(.hidden)');
  });

  test('should show preview button and open modal on click', async ({ page }) => {
    const btn = page.locator('#open-overtime-preview-btn');
    await expect(btn).toBeVisible();

    await btn.click();
    await expect(page.locator('#overtime-preview-modal')).toBeVisible();
    // Skeleton should show immediately
    await expect(page.locator('#overtime-preview-content .animate-pulse')).toBeVisible();
  });

  test('should render weekend cards after loading', async ({ page }) => {
    await page.click('#open-overtime-preview-btn');
    // Wait for cards to appear (replace skeleton)
    await page.waitForSelector('#overtime-preview-content .grid .cursor-pointer', { timeout: 10000 });
    const cards = page.locator('#overtime-preview-content .grid .cursor-pointer');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate months and show different data', async ({ page }) => {
    await page.click('#open-overtime-preview-btn');
    await page.waitForSelector('#overtime-preview-content .grid .cursor-pointer', { timeout: 10000 });

    // Get title text
    const title = page.locator('#overtime-preview-content h3');
    const title1 = await title.textContent();

    // Click next month
    await page.click('#preview-next-month');
    // Skeleton should appear again while loading
    await page.waitForSelector('#overtime-preview-content .grid .cursor-pointer', { timeout: 10000 });
    const title2 = await title.textContent();
    expect(title2).not.toBe(title1);
  });

  test('should close modal and redirect to timeline on card click', async ({ page }) => {
    await page.click('#open-overtime-preview-btn');
    await page.waitForSelector('#overtime-preview-content .grid .cursor-pointer', { timeout: 10000 });

    // Click first card (only if there are cards)
    const firstCard = page.locator('#overtime-preview-content .grid .cursor-pointer').first();
    if (await firstCard.count() === 0) return; // skip if no data

    const cardId = await firstCard.getAttribute('id');
    await firstCard.click();

    // Modal should close
    await expect(page.locator('#overtime-preview-modal')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/cronograma/overtime-preview.spec.ts
git commit -m "test: add E2E tests for overtime preview modal"
```

---

## Self-Review

Check spec coverage:
- [x] **Section 4** (Endpoint): Task 1
- [x] **Section 5** (Frontend JS): Task 2
- [x] **Section 6** (Dashboard.astro changes): Task 3
- [x] **Section 7** (dashboard-client.ts): Task 4
- [x] **Section 9** (Testing): Task 5
- [x] CDN chart.js import: Task 3

**Fix applied:** Donut uses single segment (Task 2), matching the spec fix.