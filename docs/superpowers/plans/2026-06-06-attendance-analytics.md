# Control de Asistencia - Reportes y Estadísticas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monthly attendance analytics and reporting sub-page under the attendance module to visualize team-wide patterns and individual operator logs.

**Architecture:** A dedicated sub-page `/supervision/asistencia/estadisticas` that queries the existing range-based API (`/api/asistencia`) client-side, parses logs for metrics, and renders team/operator statistics using Chart.js (via CDN) and a customized contribution-style grid.

**Tech Stack:** Astro, Tailwind CSS, DaisyUI, Chart.js (CDN), TypeScript.

---

### Task 1: Navigation Entry Point in Daily Dashboard

**Files:**
- Modify: `src/pages/supervision/asistencia/index.astro:57-73`

- [ ] **Step 1: Write code modification to add the Analytics button**
  Add the Analytics link with a chart icon next to the "Exportar CSV" button.
  
  Replace the actions section in `src/pages/supervision/asistencia/index.astro` around lines 58-73:
  ```html
        <!-- Search, Sort and Export Actions -->
        <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <!-- Estadísticas -->
          <a 
            href={`${cleanBase}supervision/asistencia/estadisticas`} 
            class="btn btn-outline btn-sm border-base-300 text-base-content/75 hover:bg-base-200 rounded-xl px-3 w-10 h-10 flex items-center justify-center shrink-0"
            title="Ver estadísticas y reportes mensuales"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-base-content/75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </a>

          <!-- Exportar CSV -->
          <button 
            type="button" 
            id="export-csv-btn" 
            class="btn btn-outline btn-sm border-base-300 text-base-content/75 hover:bg-base-200 rounded-xl px-4 flex items-center gap-1.5 w-full sm:w-auto font-bold h-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-base-content/75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Exportar CSV
          </button>
  ```

- [ ] **Step 2: Verify code syntax compiles**
  Run: `npm run build`
  Expected: Command finishes successfully with no TypeScript compilation errors.

- [ ] **Step 3: Commit**
  ```bash
  git add src/pages/supervision/asistencia/index.astro
  git commit -m "feat(asistencia): add statistics navigation button to dashboard"
  ```

---

### Task 2: Create basic page shell and routing for Statistics page

**Files:**
- Create: `src/pages/supervision/asistencia/estadisticas.astro`

- [ ] **Step 1: Write basic file with layout and route protection**
  Create the new file containing basic structure, base path mapping, and authentication logic.
  
  Code for `src/pages/supervision/asistencia/estadisticas.astro`:
  ```astro
  ---
  import BaseLayout from "@layouts/BaseLayout.astro";
  import PageContainer from "@components/ui/PageContainer.astro";
  import PageHeader from "@components/ui/PageHeader.astro";
  import { Icon } from "astro-icon/components";

  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : base + "/";

  const user = Astro.locals.user;
  if (!["admin", "supervisor"].includes(user.role)) return Astro.redirect(`${cleanBase}login`);

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const defaultMonth = `${y}-${m}`;
  ---

  <BaseLayout>
    <PageContainer width="xl">
      <a
        href={`${cleanBase}supervision/asistencia`}
        class="btn btn-ghost btn-sm mb-2 w-fit pl-2 transition-colors duration-200"
      >
        <Icon name="boxicons:chevron-left" size={16} />
        Volver a Control Diario
      </a>

      <PageHeader
        title="Estadísticas y Reportes Mensuales"
        description="Analíticas de puntualidad, distribución de eventualidades del equipo y fichas de cumplimiento individual."
      />

      <div class="flex flex-col gap-6 w-full pb-24 animate-in fade-in duration-500">
        <!-- Controls & Filters Bar -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-base-content/70">Seleccionar Mes:</span>
            <input 
              type="month" 
              id="analytics-month"
              value={defaultMonth}
              class="bg-base-200 border border-base-300 rounded-xl px-4 py-2 text-sm font-bold text-base-content outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-all"
            />
          </div>
        </div>
      </div>
    </PageContainer>
  </PageLayout>
  ```

- [ ] **Step 2: Run verification build**
  Run: `npm run build`
  Expected: Complete! with no errors.

- [ ] **Step 3: Commit**
  ```bash
  git add src/pages/supervision/asistencia/estadisticas.astro
  git commit -m "feat(asistencia): create shell file for attendance statistics route"
  ```

---

### Task 3: Chart.js integration and UI Layout setup

**Files:**
- Modify: `src/pages/supervision/asistencia/estadisticas.astro`

- [ ] **Step 1: Write HTML markup for the Analytics Dashboard grid**
  Include the Script tags for Chart.js CDN, KPI cards, and canvas placeholders. Add this code inside the main container div in `src/pages/supervision/asistencia/estadisticas.astro`.
  
  Add to the bottom of the template before the `---` scripts end:
  ```html
        <!-- KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full" id="kpi-container">
          <div class="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-1">
            <span class="text-[10px] text-base-content/40 uppercase font-black tracking-wider">Tasa Puntualidad</span>
            <span class="text-2xl font-black text-secondary" id="kpi-punctuality">--%</span>
          </div>
          <div class="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-1">
            <span class="text-[10px] text-base-content/40 uppercase font-black tracking-wider">Asistencias Totales</span>
            <span class="text-2xl font-black text-emerald-500" id="kpi-total">--</span>
          </div>
          <div class="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-1">
            <span class="text-[10px] text-base-content/40 uppercase font-black tracking-wider">Total Ausencias</span>
            <span class="text-2xl font-black text-error" id="kpi-absences">--</span>
          </div>
          <div class="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-1">
            <span class="text-[10px] text-base-content/40 uppercase font-black tracking-wider">Mayor Ausencia</span>
            <span class="text-lg font-black text-base-content truncate" id="kpi-top-reason">--</span>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
          <!-- Doughnut Chart -->
          <div class="bg-base-100 p-5 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-4">
            <h3 class="text-xs font-black uppercase tracking-wider text-base-content/70">Distribución de Eventualidades</h3>
            <div class="relative w-full h-[220px] flex items-center justify-center">
              <canvas id="doughnut-chart"></canvas>
            </div>
          </div>
          <!-- Bar Chart -->
          <div class="bg-base-100 p-5 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-4 lg:col-span-2">
            <h3 class="text-xs font-black uppercase tracking-wider text-base-content/70">Tendencia Semanal de Puntualidad</h3>
            <div class="relative w-full h-[220px]">
              <canvas id="bar-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Ranking and Operator Profile Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
          <!-- Podio / Rankings -->
          <div class="bg-base-100 p-5 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-4">
            <h3 class="text-xs font-black uppercase tracking-wider text-base-content/70">Ranking de Puntualidad</h3>
            <div class="flex flex-col gap-4">
              <div>
                <h4 class="text-[10px] font-bold text-success uppercase tracking-wider mb-2">Puntualidad Perfecta 🏆</h4>
                <ol id="ranking-top" class="list-decimal list-inside text-xs font-semibold flex flex-col gap-1.5 text-base-content/80"></ol>
              </div>
              <div class="border-t border-base-200 pt-3">
                <h4 class="text-[10px] font-bold text-warning uppercase tracking-wider mb-2">Más Tardanzas / Retiros ⚠️</h4>
                <ol id="ranking-bottom" class="list-decimal list-inside text-xs font-semibold flex flex-col gap-1.5 text-base-content/80"></ol>
              </div>
            </div>
          </div>

          <!-- Operator Details Sheet -->
          <div class="bg-base-100 p-5 rounded-2xl border border-base-300 shadow-sm flex flex-col gap-4 lg:col-span-2">
            <div class="flex items-center justify-between border-b border-base-200 pb-3">
              <h3 class="text-xs font-black uppercase tracking-wider text-base-content/70">Ficha del Operador</h3>
              <select id="operator-select" class="select select-sm select-bordered rounded-xl max-w-[200px] w-full text-xs font-bold">
                <option value="">Seleccione operador...</option>
              </select>
            </div>

            <!-- Operator Stats Block -->
            <div id="operator-stats" class="hidden flex flex-col gap-4 animate-in fade-in duration-300">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="bg-base-200/50 p-3 rounded-xl border border-base-300/40 text-center">
                  <span class="text-[8px] text-base-content/40 uppercase font-black tracking-wider block">Puntualidad</span>
                  <span class="text-base font-black text-secondary" id="op-kpi-punctuality">--%</span>
                </div>
                <div class="bg-base-200/50 p-3 rounded-xl border border-base-300/40 text-center">
                  <span class="text-[8px] text-base-content/40 uppercase font-black tracking-wider block">Días Trabajados</span>
                  <span class="text-base font-black text-emerald-500" id="op-kpi-worked">--</span>
                </div>
                <div class="bg-base-200/50 p-3 rounded-xl border border-base-300/40 text-center">
                  <span class="text-[8px] text-base-content/40 uppercase font-black tracking-wider block">Llegadas Tarde</span>
                  <span class="text-base font-black text-warning" id="op-kpi-lates">--</span>
                </div>
                <div class="bg-base-200/50 p-3 rounded-xl border border-base-300/40 text-center">
                  <span class="text-[8px] text-base-content/40 uppercase font-black tracking-wider block">Ausencias</span>
                  <span class="text-base font-black text-error" id="op-kpi-absences">--</span>
                </div>
              </div>

              <!-- GitHub-Style Contribution Calendar -->
              <div>
                <h4 class="text-[10px] font-bold text-base-content/40 uppercase tracking-wider mb-2">Cuadrícula Mensual de Asistencia</h4>
                <div class="flex flex-wrap gap-1.5 p-3 bg-base-200/30 rounded-xl border border-base-300/40 justify-start" id="op-calendar-grid">
                  <!-- Casillas 1..31 -->
                </div>
                <!-- Grid Legend -->
                <div class="flex items-center gap-3 mt-3 text-[9px] font-bold text-base-content/40 select-none">
                  <div class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/30"></span> Cumplió</div>
                  <div class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/30"></span> Tarde / Retiro</div>
                  <div class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-error/15 border border-error/30"></span> Incumplió / Ausente</div>
                  <div class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-base-200/50 border border-base-300/40"></span> Franco</div>
                </div>
              </div>
            </div>

            <!-- Empty state when no operator is selected -->
            <div id="operator-empty-state" class="py-12 text-center text-base-content/40 font-medium">
              Seleccione un operador en el menú superior para ver su ficha estadística.
            </div>
          </div>
        </div>

        <!-- Chart.js CDN Link -->
        <script is:inline src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  ```

- [ ] **Step 2: Run verification build**
  Run: `npm run build`
  Expected: Complete! with no errors.

- [ ] **Step 3: Commit**
  ```bash
  git commit -am "feat(asistencia): add HTML layout and Chart.js script reference for statistics dashboard"
  ```

---

### Task 4: Implement Data Fetcher, Month-filtering, and State management

**Files:**
- Modify: `src/pages/supervision/asistencia/estadisticas.astro`

- [ ] **Step 1: Write client-side script for API fetching and filtering**
  Add a `<script>` tag at the bottom of the page to handle month changes, date range calculation, API calls, and data mapping.
  
  Append to the end of `estadisticas.astro`:
  ```astro
  <script>
    let rawLogs = [];
    let doughnutChartInstance = null;
    let barChartInstance = null;

    const monthInput = document.getElementById('analytics-month') as HTMLInputElement;
    const operatorSelect = document.getElementById('operator-select') as HTMLSelectElement;

    // Helper to get number of days in a year-month
    function getDaysInMonth(year: number, month: number): number {
      return new Date(year, month, 0).getDate();
    }

    async function loadData() {
      if (!monthInput.value) return;
      const [yearStr, monthStr] = monthInput.value.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const totalDays = getDaysInMonth(year, month);

      const startDate = `${yearStr}-${monthStr}-01`;
      const endDate = `${yearStr}-${monthStr}-${String(totalDays).padStart(2, '0')}`;

      // Show loader on KPIs
      const punctualityKPI = document.getElementById('kpi-punctuality');
      if (punctualityKPI) punctualityKPI.textContent = '...';

      try {
        const response = await fetch(`${import.meta.env.BASE_URL || "/"}api/asistencia?startDate=${startDate}&endDate=${endDate}`);
        if (!response.ok) throw new Error("Failed to fetch statistics data");
        rawLogs = await response.json();

        processGlobalMetrics();
        populateOperatorDropdown();
        updateCharts();
        
        // Refresh currently selected operator details if applicable
        if (operatorSelect.value) {
          showOperatorDetails(parseInt(operatorSelect.value));
        }
      } catch (err) {
        console.error(err);
      }
    }

    function populateOperatorDropdown() {
      const currentSelection = operatorSelect.value;
      operatorSelect.innerHTML = '<option value="">Seleccione operador...</option>';
      
      const operatorsMap = new Map();
      rawLogs.forEach(log => {
        if (!operatorsMap.has(log.agentId)) {
          operatorsMap.set(log.agentId, log.nombre);
        }
      });

      const sortedOps = Array.from(operatorsMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
      sortedOps.forEach(([id, name]) => {
        const opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = name;
        if (String(id) === currentSelection) opt.selected = true;
        operatorSelect.appendChild(opt);
      });
    }

    monthInput.addEventListener('change', loadData);
    document.addEventListener('DOMContentLoaded', loadData);
  </script>
  ```

- [ ] **Step 2: Run verification build**
  Run: `npm run build`
  Expected: Complete! with no errors.

- [ ] **Step 3: Commit**
  ```bash
  git commit -am "feat(asistencia): add API fetch and state mapping logic for monthly analytics"
  ```

---

### Task 5: Implement Team KPIs, Rankings, and Chart.js graphs

**Files:**
- Modify: `src/pages/supervision/asistencia/estadisticas.astro`

- [ ] **Step 1: Write helper functions for calculations and charts init**
  Inject the logic inside the `<script>` block of `estadisticas.astro` to update Team KPIs, ranking, and build Chart.js instances.
  
  Add the implementation inside the `<script>` tag:
  ```typescript
    function processGlobalMetrics() {
      // 1. Calculate overall metrics
      const schedulesWithTime = rawLogs.filter(log => log.horarioEstipulado && log.horarioEstipulado !== "Franco");
      const totalSchedules = schedulesWithTime.length;
      
      const punctuals = schedulesWithTime.filter(log => log.cumplimiento === "Cumplió").length;
      const totalAsistencias = rawLogs.filter(log => log.asistenciaId).length;
      const totalAusencias = rawLogs.filter(log => log.ausencia && log.ausencia !== "").length;

      // Find top absence reason
      const absenceReasons: Record<string, number> = {};
      rawLogs.forEach(log => {
        if (log.ausencia && log.ausencia !== "") {
          absenceReasons[log.ausencia] = (absenceReasons[log.ausencia] || 0) + 1;
        }
      });
      let topReason = "Ninguna";
      let maxCount = 0;
      Object.entries(absenceReasons).forEach(([reason, count]) => {
        if (count > maxCount) {
          maxCount = count;
          topReason = reason;
        }
      });

      // Update KPI nodes
      const kpiPunctuality = document.getElementById('kpi-punctuality');
      const kpiTotal = document.getElementById('kpi-total');
      const kpiAbsences = document.getElementById('kpi-absences');
      const kpiTopReason = document.getElementById('kpi-top-reason');

      if (kpiPunctuality) kpiPunctuality.textContent = totalSchedules > 0 ? `${Math.round((punctuals / totalSchedules) * 100)}%` : '0%';
      if (kpiTotal) kpiTotal.textContent = String(totalAsistencias);
      if (kpiAbsences) kpiAbsences.textContent = String(totalAusencias);
      if (kpiTopReason) kpiTopReason.textContent = topReason;

      // 2. Rankings Calculation
      const agentStats: Record<number, { name: string; total: number; punctuals: number; lates: number }> = {};
      rawLogs.forEach(log => {
        if (!log.horarioEstipulado || log.horarioEstipulado === "Franco") return;
        if (!agentStats[log.agentId]) {
          agentStats[log.agentId] = { name: log.nombre, total: 0, punctuals: 0, lates: 0 };
        }
        const stats = agentStats[log.agentId];
        stats.total++;
        if (log.cumplimiento === "Cumplió") stats.punctuals++;
        if (log.cumplimiento && log.cumplimiento !== "Cumplió" && log.cumplimiento !== "Sin Registro") {
          stats.lates++;
        }
      });

      const rankingData = Object.values(agentStats).map(s => ({
        name: s.name,
        pct: s.total > 0 ? Math.round((s.punctuals / s.total) * 100) : 0,
        lates: s.lates
      }));

      // Top 3 (Sorted by high punctuality, then least lates)
      const top3 = [...rankingData]
        .sort((a, b) => b.pct - a.pct || a.lates - b.lates)
        .slice(0, 3);

      // Bottom 3 (Sorted by high lates, then low punctuality)
      const bottom3 = [...rankingData]
        .filter(s => s.lates > 0)
        .sort((a, b) => b.lates - a.lates || a.pct - b.pct)
        .slice(0, 3);

      const topList = document.getElementById('ranking-top');
      const bottomList = document.getElementById('ranking-bottom');

      if (topList) {
        topList.innerHTML = top3.length > 0 
          ? top3.map(op => `<li>${op.name} <span class="text-success font-black float-right">${op.pct}%</span></li>`).join('') 
          : '<li class="text-base-content/40 normal-case">Sin registros suficientes</li>';
      }
      if (bottomList) {
        bottomList.innerHTML = bottom3.length > 0 
          ? bottom3.map(op => `<li>${op.name} <span class="text-warning font-black float-right">${op.lates} incid.</span></li>`).join('') 
          : '<li class="text-base-content/40 normal-case">Sin incidencias registradas</li>';
      }
    }

    function updateCharts() {
      // 1. Eventualities Doughnut Chart
      const absenceData: Record<string, number> = {};
      rawLogs.forEach(log => {
        if (log.ausencia && log.ausencia !== "") {
          absenceData[log.ausencia] = (absenceData[log.ausencia] || 0) + 1;
        }
      });
      const doughnutLabels = Object.keys(absenceData);
      const doughnutValues = Object.values(absenceData);

      const doughnutCtx = (document.getElementById('doughnut-chart') as HTMLCanvasElement).getContext('2d');
      if (doughnutChartInstance) doughnutChartInstance.destroy();
      
      if (doughnutLabels.length > 0) {
        doughnutChartInstance = new (window as any).Chart(doughnutCtx, {
          type: 'doughnut',
          data: {
            labels: doughnutLabels,
            datasets: [{
              data: doughnutValues,
              backgroundColor: [
                'rgba(16, 185, 129, 0.65)', // emerald
                'rgba(245, 158, 11, 0.65)', // amber
                'rgba(239, 68, 68, 0.65)', // red
                'rgba(99, 102, 241, 0.65)', // indigo
                'rgba(236, 72, 153, 0.65)', // pink
                'rgba(14, 165, 233, 0.65)'  // sky
              ],
              borderColor: 'rgba(150, 150, 150, 0.1)',
              borderWidth: 1.5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 10,
                  font: { family: 'Geist', size: 9, weight: 'bold' },
                  color: 'gray'
                }
              }
            }
          }
        });
      }

      // 2. Weekly Punctuality Bar Chart
      // Group by weeks
      const weeklySchedules: Record<string, { total: number; punctuals: number }> = {
        "Semana 1": { total: 0, punctuals: 0 },
        "Semana 2": { total: 0, punctuals: 0 },
        "Semana 3": { total: 0, punctuals: 0 },
        "Semana 4": { total: 0, punctuals: 0 }
      };

      rawLogs.forEach(log => {
        if (!log.horarioEstipulado || log.horarioEstipulado === "Franco") return;
        const day = parseInt(log.date.substring(8, 10));
        let weekKey = "Semana 4";
        if (day <= 7) weekKey = "Semana 1";
        else if (day <= 14) weekKey = "Semana 2";
        else if (day <= 21) weekKey = "Semana 3";

        weeklySchedules[weekKey].total++;
        if (log.cumplimiento === "Cumplió") {
          weeklySchedules[weekKey].punctuals++;
        }
      });

      const barLabels = Object.keys(weeklySchedules);
      const barValues = Object.values(weeklySchedules).map(w => w.total > 0 ? Math.round((w.punctuals / w.total) * 100) : 0);

      const barCtx = (document.getElementById('bar-chart') as HTMLCanvasElement).getContext('2d');
      if (barChartInstance) barChartInstance.destroy();

      barChartInstance = new (window as any).Chart(barCtx, {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [{
            label: '% Puntualidad',
            data: barValues,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgba(59, 130, 246, 0.9)',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              grid: { color: 'rgba(150, 150, 150, 0.05)' },
              ticks: { font: { family: 'Geist', size: 9 } }
            },
            x: {
              grid: { display: false },
              ticks: { font: { family: 'Geist', size: 9, weight: 'bold' } }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  ```

- [ ] **Step 2: Run verification build**
  Run: `npm run build`
  Expected: Complete! with no errors.

- [ ] **Step 3: Commit**
  ```bash
  git commit -am "feat(asistencia): implement team rankings, KPIs, and doughnut/bar charts render"
  ```

---

### Task 6: Implement Individual Operator Profile and Contribution-style Grid

**Files:**
- Modify: `src/pages/supervision/asistencia/estadisticas.astro`

- [ ] **Step 1: Write profile details & monthly grid cell builders**
  Add the selector event listener and the `showOperatorDetails` builder to create the GitHub-like calendar tiles.
  
  Add to the bottom of the client-side `<script>` tag:
  ```typescript
    function showOperatorDetails(agentId: number) {
      const opLogs = rawLogs.filter(log => log.agentId === agentId);
      if (opLogs.length === 0) return;

      const emptyState = document.getElementById('operator-empty-state');
      const statsBlock = document.getElementById('operator-stats');
      if (emptyState) emptyState.classList.add('hidden');
      if (statsBlock) statsBlock.classList.remove('hidden');

      // 1. Calculate Individual KPIs
      const schedulesWithTime = opLogs.filter(log => log.horarioEstipulado && log.horarioEstipulado !== "Franco");
      const totalSchedules = schedulesWithTime.length;
      
      const punctuals = schedulesWithTime.filter(log => log.cumplimiento === "Cumplió").length;
      const lates = schedulesWithTime.filter(log => log.cumplimiento && log.cumplimiento !== "Cumplió" && log.cumplimiento !== "Sin Registro").length;
      const absences = opLogs.filter(log => log.ausencia && log.ausencia !== "").length;

      const opKpiPunctuality = document.getElementById('op-kpi-punctuality');
      const opKpiWorked = document.getElementById('op-kpi-worked');
      const opKpiLates = document.getElementById('op-kpi-lates');
      const opKpiAbsences = document.getElementById('op-kpi-absences');

      if (opKpiPunctuality) opKpiPunctuality.textContent = totalSchedules > 0 ? `${Math.round((punctuals / totalSchedules) * 100)}%` : '100%';
      if (opKpiWorked) opKpiWorked.textContent = String(totalSchedules);
      if (opKpiLates) opKpiLates.textContent = String(lates);
      if (opKpiAbsences) opKpiAbsences.textContent = String(absences);

      // 2. Build GitHub Contribution-Style Grid
      const grid = document.getElementById('op-calendar-grid');
      if (grid) {
        grid.innerHTML = '';
        
        // Sort logs by date to render sequential
        const sortedLogs = [...opLogs].sort((a, b) => a.date.localeCompare(b.date));
        
        sortedLogs.forEach(log => {
          const day = parseInt(log.date.substring(8, 10));
          const cell = document.createElement('div');
          
          let colorClass = 'bg-base-200/50 border border-base-300/40 text-base-content/40';
          if (log.horarioEstipulado && log.horarioEstipulado !== "Franco") {
            if (log.cumplimiento === "Cumplió") {
              colorClass = 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30';
            } else if (log.cumplimiento === "Llegada Tarde" || log.cumplimiento === "Retiro Anticipado" || log.cumplimiento === "Tarde y Retiro Anticipado") {
              colorClass = 'bg-amber-500/20 text-amber-600 border border-amber-500/30';
            } else if (log.cumplimiento === "Incumplió" || log.cumplimiento === "Sin Registro") {
              colorClass = 'bg-error/15 text-error border border-error/30';
            }
          }
          
          cell.className = `w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black cursor-help shadow-sm transition-all duration-200 hover:scale-110 hover:z-10 ${colorClass}`;
          cell.textContent = String(day);
          
          // Form tooltip info
          const tooltipParts = [
            `Fecha: ${log.date}`,
            `Planificado: ${log.horarioEstipulado || 'Franco'}`,
            `Asistencia: ${log.asistencia || 'Sin registro'}`,
            `Cumplimiento: ${log.cumplimiento || 'Sin registro'}`
          ];
          if (log.entradaReal) tooltipParts.push(`Entrada Real: ${log.entradaReal}`);
          if (log.salidaReal) tooltipParts.push(`Salida Real: ${log.salidaReal}`);
          if (log.ausencia) tooltipParts.push(`Ausencia: ${log.ausencia}`);
          if (log.detalle) tooltipParts.push(`Comentario: ${log.detalle}`);

          cell.title = tooltipParts.join('\n');
          grid.appendChild(cell);
        });
      }
    }

    operatorSelect.addEventListener('change', () => {
      const val = operatorSelect.value;
      if (!val) {
        const emptyState = document.getElementById('operator-empty-state');
        const statsBlock = document.getElementById('operator-stats');
        if (emptyState) emptyState.classList.remove('hidden');
        if (statsBlock) statsBlock.classList.add('hidden');
      } else {
        showOperatorDetails(parseInt(val));
      }
    });
  ```

- [ ] **Step 2: Run verification build**
  Run: `npm run build`
  Expected: Complete! with no errors.

- [ ] **Step 3: Commit**
  ```bash
  git commit -am "feat(asistencia): add operator details sheet and contribution-style monthly grid"
  ```

---

### Task 7: Final Verification and System Build Check

- [ ] **Step 1: Compile the entire project to ensure no TS errors**
  Run: `npm run build`
  Expected: Build succeeds with 0 errors and empaquetado files are created under `dist/`.

- [ ] **Step 2: Commit final documentation updates**
  ```bash
  git add docs/superpowers/plans/2026-06-06-attendance-analytics.md
  git commit -m "docs: save attendance analytics implementation plan"
  ```
