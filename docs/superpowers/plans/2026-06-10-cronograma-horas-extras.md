# Horas Extras de Fin de Semana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar la gestión de horas extras de fin de semana (sábado a partir de las 13:00 hs al domingo 24:00 hs) en el cronograma, con almacenamiento en base de datos, una nueva pestaña "Extras" con línea de tiempo visual horizontal, y distintivos visuales en el calendario mensual y diario.

**Architecture:** Se agregarán las tablas `weekend_overtime_config` y `weekend_overtime_shifts` en SQLite/Drizzle. Se expondrán APIs REST para configurar referentes y turnos. El endpoint principal de cronograma integrará esta información, y la interfaz consumirá estos datos para pintar la línea de tiempo visual y añadir las etiquetas "HE: HH:MM - HH:MM" en el calendario sin alterar el estado base (ej. Franco).

**Tech Stack:** Astro, SQLite (Drizzle ORM), Tailwind CSS, DaisyUI, TypeScript

---

### Task 1: Database Schema Migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `database/test-migration.ts`

- [ ] **Step 1: Modify database schema**
  Add the `weekendOvertimeConfig` and `weekendOvertimeShifts` tables to `src/db/schema.ts`.
  
  ```typescript
  // Add to src/db/schema.ts:
  export const weekendOvertimeConfig = sqliteTable("weekend_overtime_config", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekendStartDate: text("weekend_start_date").notNull().unique(), // Sábado "YYYY-MM-DD"
    referente: text("referente").notNull(),
  });
  
  export const weekendOvertimeShifts = sqliteTable("weekend_overtime_shifts", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekendStartDate: text("weekend_start_date").notNull(), // Sábado "YYYY-MM-DD"
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // "YYYY-MM-DD" (Sábado o Domingo)
    startTime: text("start_time").notNull(), // "HH:MM"
    endTime: text("end_time").notNull(), // "HH:MM"
  });
  ```

- [ ] **Step 2: Sync SQLite database schema**
  Run: `npm run db:push`
  Expected: Schema successfully pushed to SQLite database.

- [ ] **Step 3: Create schema verification script**
  Create `database/test-migration.ts` to verify tables are accessible and work correctly.
  
  ```typescript
  import { db } from "../src/db";
  import { weekendOvertimeConfig, weekendOvertimeShifts } from "../src/db/schema";
  import { eq } from "drizzle-orm";
  
  async function test() {
    console.log("Testing migration...");
    // Config test
    await db.insert(weekendOvertimeConfig).values({
      weekendStartDate: "2026-06-06",
      referente: "Arce Franco"
    }).onConflictDoUpdate({
      target: weekendOvertimeConfig.weekendStartDate,
      set: { referente: "Arce Franco" }
    });
    const configs = await db.select().from(weekendOvertimeConfig);
    console.log("Configs:", configs);
    
    // Clean up test config
    await db.delete(weekendOvertimeConfig).where(eq(weekendOvertimeConfig.weekendStartDate, "2026-06-06"));
    console.log("Migration test complete!");
  }
  test();
  ```

- [ ] **Step 4: Run verification script**
  Run: `npx tsx database/test-migration.ts`
  Expected: Script runs and prints Configs list without database/table errors.
  
- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/db/schema.ts
  git commit -m "feat(db): add weekend overtime config and shifts tables"
  ```

---

### Task 2: Overtime API Routes

**Files:**
- Create: `src/pages/api/cronograma/overtime/config.ts`
- Create: `src/pages/api/cronograma/overtime/shifts.ts`
- Create: `database/test-overtime-api.ts`

- [ ] **Step 1: Implement Config API Route**
  Create `src/pages/api/cronograma/overtime/config.ts` to manage the Referente config.
  
  ```typescript
  import type { APIRoute } from "astro";
  import { db } from "@/db";
  import { weekendOvertimeConfig } from "@/db/schema";
  import { eq } from "drizzle-orm";
  
  export const GET: APIRoute = async ({ url }) => {
    const weekendStartDate = url.searchParams.get("weekendStartDate");
    if (!weekendStartDate) {
      return new Response(JSON.stringify({ error: "weekendStartDate is required" }), { status: 400 });
    }
    const res = await db.select().from(weekendOvertimeConfig).where(eq(weekendOvertimeConfig.weekendStartDate, weekendStartDate)).limit(1);
    return new Response(JSON.stringify(res[0] || { referente: "" }), { status: 200 });
  };
  
  export const POST: APIRoute = async ({ request }) => {
    const { weekendStartDate, referente } = await request.json();
    if (!weekendStartDate || referente === undefined) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }
    const existing = await db.select().from(weekendOvertimeConfig).where(eq(weekendOvertimeConfig.weekendStartDate, weekendStartDate)).limit(1);
    if (existing.length > 0) {
      await db.update(weekendOvertimeConfig).set({ referente }).where(eq(weekendOvertimeConfig.id, existing[0].id));
    } else {
      await db.insert(weekendOvertimeConfig).values({ weekendStartDate, referente });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  ```

- [ ] **Step 2: Implement Shifts API Route**
  Create `src/pages/api/cronograma/overtime/shifts.ts` to manage shifts.
  
  ```typescript
  import type { APIRoute } from "astro";
  import { db } from "@/db";
  import { weekendOvertimeShifts } from "@/db/schema";
  import { eq, and } from "drizzle-orm";
  
  export const GET: APIRoute = async ({ url }) => {
    const weekendStartDate = url.searchParams.get("weekendStartDate");
    if (!weekendStartDate) {
      return new Response(JSON.stringify({ error: "weekendStartDate is required" }), { status: 400 });
    }
    const res = await db.select().from(weekendOvertimeShifts).where(eq(weekendOvertimeShifts.weekendStartDate, weekendStartDate));
    return new Response(JSON.stringify(res), { status: 200 });
  };
  
  export const POST: APIRoute = async ({ request }) => {
    const { id, weekendStartDate, agentId, date, startTime, endTime } = await request.json();
    if (!weekendStartDate || !agentId || !date || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }
    if (id) {
      await db.update(weekendOvertimeShifts).set({ agentId, date, startTime, endTime }).where(eq(weekendOvertimeShifts.id, id));
    } else {
      await db.insert(weekendOvertimeShifts).values({ weekendStartDate, agentId, date, startTime, endTime });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  
  export const DELETE: APIRoute = async ({ request }) => {
    const { id } = await request.json();
    if (!id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400 });
    await db.delete(weekendOvertimeShifts).where(eq(weekendOvertimeShifts.id, id));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  ```

- [ ] **Step 3: Create API test script**
  Create `database/test-overtime-api.ts` to test config and shift endpoints.
  
  ```typescript
  import { db } from "../src/db";
  import { weekendOvertimeConfig, weekendOvertimeShifts } from "../src/db/schema";
  
  async function test() {
     console.log("Cleaning up overtime test data...");
     await db.delete(weekendOvertimeConfig);
     await db.delete(weekendOvertimeShifts);
     console.log("API tables ready.");
  }
  test();
  ```

- [ ] **Step 4: Run API test script**
  Run: `npx tsx database/test-overtime-api.ts`
  Expected: Prints "API tables ready." without error.

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/pages/api/cronograma/overtime/
  git commit -m "feat(api): implement weekend overtime config and shifts endpoints"
  ```

---

### Task 3: Update Cronograma GET API Route

**Files:**
- Modify: `src/pages/api/cronograma/index.ts`
- Modify: `src/components/cronograma/lib/types.ts`

- [ ] **Step 1: Add overtime property to type OperatorData**
  Open `src/components/cronograma/lib/types.ts` and add `overtimeShifts` property to `OperatorData`.
  
  ```typescript
  // Modify src/components/cronograma/lib/types.ts:
  export interface OvertimeShift {
    id: number;
    weekendStartDate: string;
    agentId: number;
    date: string;
    startTime: string;
    endTime: string;
  }
  
  // Update OperatorData interface:
  export interface OperatorData {
    // ... existing fields ...
    overtimeShifts?: OvertimeShift[];
  }
  ```

- [ ] **Step 2: Modify Cronograma GET API to fetch and merge overtime shifts**
  Open `src/pages/api/cronograma/index.ts` and update it to retrieve shifts and map them to each agent.
  
  ```typescript
  // Modify src/pages/api/cronograma/index.ts:
  // Add import:
  import { agents, schedules, saturdayRotationConfig, weekendOvertimeShifts } from "@/db/schema";
  
  // Inside GET:
  // Fetch all overtime shifts:
  const dbOvertimeShifts = await db.select().from(weekendOvertimeShifts);
  
  // Update baseline mapping:
  const baseline = dbAgents.map((agent) => ({
    // ... existing fields ...
    overtimeShifts: dbOvertimeShifts
      .filter((s) => s.agentId === agent.id)
      .map((s) => ({
        id: s.id,
        weekendStartDate: s.weekendStartDate,
        agentId: s.agentId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
  }));
  ```

- [ ] **Step 3: Run project build check**
  Run: `npx astro check`
  Expected: No TypeScript or syntax errors in the API or types.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add src/components/cronograma/lib/types.ts src/pages/api/cronograma/index.ts
  git commit -m "feat(api): integrate overtime shifts in main cronograma endpoint"
  ```

---

### Task 4: Add "Extras" Tab and View in CronogramaDashboard

**Files:**
- Modify: `src/components/cronograma/CronogramaDashboard.astro`

- [ ] **Step 1: Add "Extras" button to `#view-switcher`**
  Modify `#view-switcher` tab list to include the "Extras" button:
  
  ```html
  <!-- Modify src/components/cronograma/CronogramaDashboard.astro: -->
  <!-- Under switcher button 'Grupos' (line ~38-43): -->
  <button 
    type="button" 
    id="switch-to-overtime-btn" 
    class="btn btn-xs btn-outline border-transparent text-base-content/60 hover:bg-base-200/50 font-black uppercase tracking-widest text-[9px] px-3.5 h-7 rounded-lg transition-all duration-200"
  >
    Extras
  </button>
  ```

- [ ] **Step 2: Add `#overtime-view` container markup**
  Under `#groups-view` (line ~629-631), insert the `#overtime-view` structure:
  
  ```html
  <!-- Add inside src/components/cronograma/CronogramaDashboard.astro, after id="groups-view" closing div -->
  <div id="overtime-view" class="animate-in slide-in-from-bottom-2 fade-in duration-500 hidden">
    <div class="bg-base-100 rounded-2xl border border-base-300 shadow-md p-6 space-y-6">
      
      <!-- Top header / configuration -->
      <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 p-4 bg-base-200/50 rounded-xl border border-base-300/60 shadow-sm">
        <div class="flex flex-col md:flex-row md:items-end gap-4 w-full">
          
          <div class="flex flex-col gap-1.5 shrink-0">
            <label class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Fin de Semana (Sábado)</label>
            <div id="overtime-weekend-date-wrapper" class="relative flex h-8 min-w-44 items-center gap-2 bg-base-100 px-3 py-1.5 rounded-lg border border-base-300 shadow-sm hover:border-secondary/40 transition-colors duration-200 focus-within:ring-2 focus-within:ring-secondary/20 cursor-pointer">
              <Icon name="boxicons:calendar" size={14} class="text-base-content/40 pointer-events-none" />
              <span id="overtime-weekend-date-display" class="text-xs font-semibold tabular-nums text-base-content pointer-events-none">Seleccionar Sábado...</span>
              <input type="date" id="overtime-weekend-date" class="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 opacity-0" required />
            </div>
          </div>
          
          <div class="flex flex-col gap-1.5 flex-1 max-w-sm">
            <label for="overtime-referente" class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Referente del Fin de Semana</label>
            <input type="text" id="overtime-referente" class="input input-sm input-bordered font-bold text-base-content h-8" placeholder="Ej: Arce Franco" />
          </div>
          
          <button type="button" id="save-overtime-config-btn" class="btn btn-sm btn-primary shrink-0 gap-1.5 uppercase font-bold text-[10px] h-8">
            <Icon name="boxicons:save" size={14} />
            Guardar Referente
          </button>
        </div>
      </div>
  
      <!-- Visual horizontal timeline -->
      <div class="card bg-base-200/20 border border-base-300 shadow-md">
        <div class="card-body p-4 space-y-4">
          <h3 class="font-black text-xs uppercase tracking-wider text-base-content/60 flex items-center gap-2">
            <Icon name="boxicons:time" size={16} class="text-secondary" />
            Línea de Tiempo Visual (Sábado 13:00hs a Domingo 24:00hs)
          </h3>
          
          <div class="overflow-x-auto border border-base-300 rounded-xl bg-base-100 p-2 scrollbar-thin">
            <!-- Timeline Grid wrapper -->
            <div id="overtime-timeline-wrapper" class="min-w-[1200px] select-none">
              <!-- Headers -->
              <div class="flex border-b border-base-200 text-[9px] font-black text-base-content/40 uppercase tracking-widest pb-1 select-none">
                <div class="w-48 shrink-0 pl-2">Operador</div>
                <div class="flex-1 flex justify-between relative px-2">
                  <!-- Saturday columns 13 to 24 -->
                  <div class="absolute left-0 text-secondary">Sáb 13:00</div>
                  <div class="absolute left-[15%]">Sáb 17:00</div>
                  <div class="absolute left-[30%]">Sáb 21:00</div>
                  <div class="absolute left-[45%] text-accent">Dom 01:00</div>
                  <div class="absolute left-[60%]">Dom 05:00</div>
                  <div class="absolute left-[70%]">Dom 09:00</div>
                  <div class="absolute left-[80%]">Dom 13:00</div>
                  <div class="absolute left-[90%]">Dom 19:00</div>
                  <div class="absolute right-0 text-error">Dom 24:00</div>
                </div>
              </div>
              
              <!-- Plot rows container -->
              <div id="overtime-timeline-rows" class="divide-y divide-base-200/50 mt-1 min-h-16">
                 <!-- Injected dynamically -->
              </div>
            </div>
          </div>
        </div>
      </div>
  
      <!-- Add shift form & active list grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Form to Add Shift -->
        <div class="card bg-base-200/20 border border-base-300 shadow-md">
          <div class="card-body p-4 space-y-4">
            <h3 class="font-black text-xs uppercase tracking-wider text-base-content border-b border-base-300 pb-2 flex items-center gap-2">
              <Icon name="boxicons:plus-circle" size={16} class="text-secondary" />
              Asignar Turno Extra
            </h3>
            
            <form id="add-overtime-shift-form" class="space-y-3">
              <div class="flex flex-col gap-1.5">
                <label for="overtime-agent-select" class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Operador</label>
                <select id="overtime-agent-select" class="select select-sm select-bordered w-full font-bold" required>
                  <option value="" disabled selected>Seleccionar...</option>
                </select>
              </div>
              
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <label for="overtime-day-select" class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Día</label>
                  <select id="overtime-day-select" class="select select-sm select-bordered w-full font-bold" required>
                    <option value="saturday">Sábado</option>
                    <option value="sunday">Domingo</option>
                  </select>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="overtime-start-time" class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Hora Inicio</label>
                  <input type="time" id="overtime-start-time" class="input input-sm input-bordered font-mono font-bold" required />
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <label for="overtime-end-time" class="text-[9px] font-black uppercase tracking-wider text-base-content/40">Hora Fin</label>
                  <input type="time" id="overtime-end-time" class="input input-sm input-bordered font-mono font-bold" required />
                </div>
                <div class="flex items-end">
                  <button type="submit" class="btn btn-sm btn-primary w-full gap-1.5 uppercase font-bold text-[10px]">
                    <Icon name="boxicons:plus" size={14} />
                    Asignar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
  
        <!-- Right: Table of Active Shifts -->
        <div class="card bg-base-200/20 border border-base-300 shadow-md lg:col-span-2">
          <div class="card-body p-4 space-y-4">
            <h3 class="font-black text-xs uppercase tracking-wider text-base-content border-b border-base-300 pb-2 flex items-center justify-between">
              <span class="flex items-center gap-2">
                <Icon name="boxicons:list-ul" size={16} class="text-secondary" />
                Lista de Turnos
              </span>
              <span id="overtime-shifts-count" class="badge badge-sm badge-neutral font-bold">0 turnos</span>
            </h3>
            
            <div class="overflow-x-auto max-h-[280px] overflow-y-auto scrollbar-thin">
              <table class="table table-xs w-full">
                <thead>
                  <tr class="font-black uppercase tracking-wider text-base-content/40 border-b border-base-300">
                    <th>Operador</th>
                    <th>Día</th>
                    <th>Horario</th>
                    <th class="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody id="overtime-shifts-list-body" class="divide-y divide-base-200/40">
                  <!-- Injected dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  ```

- [ ] **Step 3: Run build check**
  Run: `npx astro check`
  Expected: Builds correctly without syntax issues in CronogramaDashboard.astro.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git commit -am "feat(ui): add Horas Extras markup view and button to switcher"
  ```

---

### Task 5: Implement UI Client Logic for Horas Extras in `dashboard-client.ts`

**Files:**
- Modify: `src/components/cronograma/lib/dashboard-client.ts`

- [ ] **Step 1: Declare overtime states and date selection helpers**
  At the top of `src/components/cronograma/lib/dashboard-client.ts`, add variables and date helpers:
  
  ```typescript
  // Top level state additions (line ~20):
  let activeOvertimeWeekendSaturday: string | null = null;
  let activeOvertimeConfig: { referente: string } | null = null;
  let activeOvertimeShifts: OvertimeShift[] = [];
  
  // Date calculation helper:
  function getOvertimeDates(satStr: string): { saturday: string; sunday: string } {
    const sat = new Date(satStr + "T12:00:00");
    const sun = new Date(sat);
    sun.setDate(sun.getDate() + 1);
    
    return {
      saturday: satStr,
      sunday: formatYMD(sun)
    };
  }
  ```

- [ ] **Step 2: Add navigation and switch view handler**
  In `setupEventListeners()`:
  
  ```typescript
  // Add to setupEventListeners:
  document.getElementById('switch-to-overtime-btn')?.addEventListener('click', () => {
    showOvertimeView();
  });
  ```

- [ ] **Step 3: Define showOvertimeView and renderOvertimeView**
  Implement show and render methods:
  
  ```typescript
  // Implement in src/components/cronograma/lib/dashboard-client.ts:
  function showOvertimeView(): void {
    const dailyView = document.getElementById('daily-view');
    const monthlyView = document.getElementById('monthly-view');
    const groupsView = document.getElementById('groups-view');
    const overtimeView = document.getElementById('overtime-view');
    const datePickerContainer = document.getElementById('date-picker-container');
    
    updateViewSwitcherUI('overtime' as any);
    
    if (dailyView) dailyView.classList.add('hidden');
    if (monthlyView) monthlyView.classList.add('hidden');
    if (groupsView) groupsView.classList.add('hidden');
    if (overtimeView) overtimeView.classList.remove('hidden');
    
    if (datePickerContainer) {
      datePickerContainer.classList.add('is-faded');
      setTimeout(() => datePickerContainer.classList.add('hidden'), 300);
    }
  
    // Default to current weekend saturday
    if (!activeOvertimeWeekendSaturday) {
      const today = new Date();
      const day = today.getDay();
      const sat = new Date(today);
      sat.setDate(today.getDate() - (day === 0 ? 1 : day === 6 ? 0 : (6 - day)));
      activeOvertimeWeekendSaturday = formatYMD(sat);
    }
    
    const weekendInput = document.getElementById('overtime-weekend-date') as HTMLInputElement | null;
    if (weekendInput) {
      weekendInput.value = activeOvertimeWeekendSaturday;
      const displayEl = document.getElementById('overtime-weekend-date-display');
      if (displayEl) {
        const { saturday, sunday } = getOvertimeDates(activeOvertimeWeekendSaturday);
        displayEl.innerText = `${formatToDDMMYY(saturday)} - ${formatToDDMMYY(sunday)}`;
      }
    }
    
    renderOvertimeView();
  }
  
  // Update updateViewSwitcherUI (add overtime button toggle):
  // Modify updateViewSwitcherUI function in src/components/cronograma/lib/dashboard-client.ts to support 'overtime'
  ```

- [ ] **Step 4: Implement renderOvertimeView fetch and render logic**
  Implement the fetching and rendering of Referente, Visual Timeline, and active shifts list.
  
  ```typescript
  async function renderOvertimeView(): Promise<void> {
    if (!activeOvertimeWeekendSaturday) return;
    try {
      // 1. Fetch Config
      const configRes = await fetch(`/api/cronograma/overtime/config?weekendStartDate=${activeOvertimeWeekendSaturday}`);
      activeOvertimeConfig = await configRes.json();
      const refInput = document.getElementById('overtime-referente') as HTMLInputElement | null;
      if (refInput && activeOvertimeConfig) {
        refInput.value = activeOvertimeConfig.referente || '';
      }
      
      // 2. Fetch Shifts
      const shiftsRes = await fetch(`/api/cronograma/overtime/shifts?weekendStartDate=${activeOvertimeWeekendSaturday}`);
      activeOvertimeShifts = await shiftsRes.json();
      
      // Populate selectors
      const select = document.getElementById('overtime-agent-select') as HTMLSelectElement | null;
      if (select) {
        select.innerHTML = '<option value="" disabled selected>Seleccionar...</option>';
        state.cronoData.forEach(agent => {
          const opt = document.createElement('option');
          opt.value = String(agent.id);
          opt.textContent = agent.nombre;
          select.appendChild(opt);
        });
      }
      
      // Render Table List
      const listBody = document.getElementById('overtime-shifts-list-body');
      const countEl = document.getElementById('overtime-shifts-count');
      if (countEl) countEl.innerText = `${activeOvertimeShifts.length} turno${activeOvertimeShifts.length !== 1 ? 's' : ''}`;
      if (listBody) {
        listBody.innerHTML = '';
        if (activeOvertimeShifts.length === 0) {
          listBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-base-content/40">Sin turnos asignados para este fin de semana</td></tr>`;
        } else {
          activeOvertimeShifts.forEach(shift => {
            const agentName = state.cronoData.find(a => a.id === shift.agentId)?.nombre || 'Desconocido';
            const dayName = new Date(shift.date + 'T12:00:00').getDay() === 6 ? 'Sábado' : 'Domingo';
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td class="font-bold">${escapeHtml(agentName)}</td>
              <td>${dayName} (${formatToDDMMYY(shift.date)})</td>
              <td class="font-mono">${shift.startTime} - ${shift.endTime}</td>
              <td class="text-right">
                <button type="button" class="btn btn-square btn-ghost btn-xs text-error delete-overtime-shift-btn" data-id="${shift.id}">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </td>
            `;
            listBody.appendChild(tr);
          });
        }
      }
      
      // Render Visual Timeline
      renderTimelineVisuals();
    } catch (err) {
      console.error(err);
      showToast("Error al cargar horas extras", "error");
    }
  }
  ```

- [ ] **Step 5: Implement Timeline Plotting**
  Add the `renderTimelineVisuals()` method to draw the visual horizontal timeline blocks from Saturday 13hs to Sunday 24hs.
  
  ```typescript
  function renderTimelineVisuals(): void {
    const rowsContainer = document.getElementById('overtime-timeline-rows');
    if (!rowsContainer) return;
    rowsContainer.innerHTML = '';
    
    // Group shifts by agent
    const agentShifts: Record<string, OvertimeShift[]> = {};
    activeOvertimeShifts.forEach(s => {
      const name = state.cronoData.find(a => a.id === s.agentId)?.nombre || 'Desconocido';
      if (!agentShifts[name]) agentShifts[name] = [];
      agentShifts[name].push(s);
    });
    
    const agentsWithShifts = Object.keys(agentShifts);
    if (agentsWithShifts.length === 0) {
      rowsContainer.innerHTML = `
        <div class="py-6 text-center text-xs text-base-content/30 font-medium">
          No hay turnos para trazar en la línea de tiempo
        </div>
      `;
      return;
    }
    
    // Total duration of weekend segment: Sábado 13:00 to Domingo 24:00 (35 hours total)
    const segmentStartHour = 13; // Saturday 13:00
    const totalSegmentHours = 35; 
    
    agentsWithShifts.sort().forEach(agentName => {
      const row = document.createElement('div');
      row.className = "flex items-center h-10 relative select-none hover:bg-base-200/40 transition-colors";
      
      const nameCol = document.createElement('div');
      nameCol.className = "w-48 shrink-0 pl-2 font-bold text-xs truncate text-base-content/80";
      nameCol.innerText = agentName;
      row.appendChild(nameCol);
      
      const barContainer = document.createElement('div');
      barContainer.className = "flex-1 h-full relative border-l border-base-200";
      
      // Plot each shift
      agentShifts[agentName].forEach(shift => {
        const isSunday = new Date(shift.date + 'T12:00:00').getDay() === 0;
        const [startH, startM] = shift.startTime.split(':').map(Number);
        const [endH, endM] = shift.endTime.split(':').map(Number);
        
        let startOffsetHours = (isSunday ? 24 : 0) + startH + (startM / 60) - segmentStartHour;
        let durationHours = (endH + (endM / 60)) - (startH + (startM / 60));
        if (durationHours < 0) {
          // Midnight crossing
          durationHours = (24 + endH + (endM / 60)) - (startH + (startM / 60));
        }
        
        const leftPercent = (startOffsetHours / totalSegmentHours) * 100;
        const widthPercent = (durationHours / totalSegmentHours) * 100;
        
        const block = document.createElement('div');
        block.className = "absolute h-7 top-1.5 rounded-lg bg-secondary text-secondary-content px-2 py-0.5 text-[9px] font-black uppercase tracking-tight flex items-center justify-between border border-secondary shadow-sm overflow-hidden select-none";
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;
        block.innerHTML = `<span class="truncate">${agentName}</span> <span class="font-mono text-[8px] opacity-80 shrink-0 ml-1">${shift.startTime}-${shift.endTime}</span>`;
        barContainer.appendChild(block);
      });
      
      row.appendChild(barContainer);
      rowsContainer.appendChild(row);
    });
  }
  ```

- [ ] **Step 6: Handle save/delete and date change actions**
  Attach event listeners in client logic:
  
  ```typescript
  // Add inside setupEventListeners:
  const weekendInput = document.getElementById('overtime-weekend-date') as HTMLInputElement | null;
  weekendInput?.addEventListener('change', () => {
    if (weekendInput.value) {
      activeOvertimeWeekendSaturday = weekendInput.value;
      const displayEl = document.getElementById('overtime-weekend-date-display');
      if (displayEl) {
        const { saturday, sunday } = getOvertimeDates(activeOvertimeWeekendSaturday);
        displayEl.innerText = `${formatToDDMMYY(saturday)} - ${formatToDDMMYY(sunday)}`;
      }
      renderOvertimeView();
    }
  });
  
  document.getElementById('save-overtime-config-btn')?.addEventListener('click', async () => {
    const refVal = (document.getElementById('overtime-referente') as HTMLInputElement).value;
    if (!activeOvertimeWeekendSaturday) return;
    
    await fetch('/api/cronograma/overtime/config', {
      method: 'POST',
      body: JSON.stringify({ weekendStartDate: activeOvertimeWeekendSaturday, referente: refVal })
    });
    showToast("Referente guardado con éxito", "success");
    renderOvertimeView();
  });
  
  document.getElementById('add-overtime-shift-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const agentId = parseInt((document.getElementById('overtime-agent-select') as HTMLSelectElement).value, 10);
    const day = (document.getElementById('overtime-day-select') as HTMLSelectElement).value;
    const startTime = (document.getElementById('overtime-start-time') as HTMLInputElement).value;
    const endTime = (document.getElementById('overtime-end-time') as HTMLInputElement).value;
    
    if (!activeOvertimeWeekendSaturday || !agentId || !startTime || !endTime) return;
    
    const dates = getOvertimeDates(activeOvertimeWeekendSaturday);
    const date = day === 'saturday' ? dates.saturday : dates.sunday;
    
    const res = await fetch('/api/cronograma/overtime/shifts', {
      method: 'POST',
      body: JSON.stringify({ weekendStartDate: activeOvertimeWeekendSaturday, agentId, date, startTime, endTime })
    });
    if (res.ok) {
      showToast("Turno asignado con éxito", "success");
      (document.getElementById('add-overtime-shift-form') as HTMLFormElement).reset();
      renderOvertimeView();
      // Reload calendar data in background
      fetchCronogramaData().then(data => { state.cronoData = data; });
    }
  });
  
  document.getElementById('overtime-shifts-list-body')?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.delete-overtime-shift-btn');
    if (!btn) return;
    const id = parseInt((btn as HTMLButtonElement).dataset.id || '', 10);
    if (!id) return;
    
    const confirmed = await showConfirm("¿Estás seguro de que deseas eliminar este turno?");
    if (confirmed) {
      const res = await fetch('/api/cronograma/overtime/shifts', {
        method: 'DELETE',
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        showToast("Turno eliminado con éxito", "success");
        renderOvertimeView();
        // Reload calendar data in background
        fetchCronogramaData().then(data => { state.cronoData = data; });
      }
    }
  });
  ```

- [ ] **Step 7: Verify Syntax & Build**
  Run: `npx astro check`
  Expected: Project builds cleanly.

- [ ] **Step 8: Commit**
  Run:
  ```bash
  git commit -am "feat(ui): implement client-side controller logic for overtime view and operations"
  ```

---

### Task 6: Integrate Overtime Indicators in Calendar Views

**Files:**
- Modify: `src/components/cronograma/lib/dashboard-client.ts`

- [ ] **Step 1: Check for Overtime shifts in cell renderer**
  Update the cell generation in `renderMonthly()` in `src/components/cronograma/lib/dashboard-client.ts`.
  
  Find the loop that iterates over `parsedDates` inside `renderMonthly()`. Around the cell status render (~line 1256):
  
  ```typescript
  // Modify inside renderMonthly() loop:
  // Before building the TD for active status:
  const overtimeShift = op.overtimeShifts?.find(s => s.date === date);
  const hasOvertime = !!overtimeShift;
  
  // If rendering active cells (Home Office, Presencial, etc.), we can append a badge or change styling.
  // In the monthly view cells:
  // After finding statusBtnClass / francoBtnClass:
  ```
  
  Update `francoBtnClass` rendering:
  ```typescript
  // Replace:
  tbodyHtml += `<td class="${cellClass}">
    <button
      ...
    >
      ${hasComment ? '<div class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Tiene comentario"></div>' : ''}
      ${hasOvertime ? `<div class="absolute bottom-1 bg-secondary text-secondary-content text-[7px] font-black px-1 py-0.5 rounded leading-none">HE: ${overtimeShift.startTime}</div>` : ''}
    </button>
  </td>`;
  ```
  
  And for active cells (`statusBtnClass` button):
  ```typescript
  tbodyHtml += `
    <td class="${cellClass}">
      <button
        ...
      >
        <span class="font-black text-xs leading-none tracking-tight">${initials}</span>
        ${isLicenseOverlap ? '<div class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error border border-base-100"></div>' : ''}
        ${hasComment ? '<div class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-base-100" title="Tiene comentario"></div>' : ''}
        ${isRotationCell ? '<div class="absolute bottom-1.5 w-1 h-1 rounded-full bg-secondary"></div>' : ''}
        ${hasOvertime ? `<div class="absolute bottom-1 bg-secondary text-secondary-content text-[7px] font-black px-1 py-0.5 rounded leading-none">HE: ${overtimeShift.startTime}</div>` : ''}
      </button>
    </td>
  `;
  ```

- [ ] **Step 2: Add Overtime shifts to Operator Drawer & Day Detail Modal**
  Modify `src/components/cronograma/subcomponents/MonthlyDetailModal.astro` or the drawer handling in `dashboard-client.ts`. Let's check where the day detail or monthly detail is handled in `dashboard-client.ts`.
  Let's see: `MonthlyDetailModal` has details. Let's make sure that when we click the cell, the event passes overtime details.
  In `dashboard-client.ts` click handler:
  
  ```typescript
  // Update detail custom event dispatch:
  document.dispatchEvent(new CustomEvent('cronograma:open-monthly-detail', {
    detail: { 
      trigger,
      overtime: hasOvertime ? `${overtimeShift.startTime} - ${overtimeShift.endTime}` : null
    }
  }));
  ```
  
  Let's check `src/components/cronograma/subcomponents/MonthlyDetailModal.astro` or how it's handled. We should check if we need to modify the detail modal to display the overtime range. Let's do a quick grep search for `cronograma:open-monthly-detail`.

- [ ] **Step 3: Run project build**
  Run: `npx astro check`
  Expected: Success without errors.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git commit -am "feat(ui): display weekend overtime badges in monthly cells and details"
  ```

---

### Task 7: E2E Playwright Verification

**Files:**
- Create: `tests/overtime-verification.spec.ts`

- [ ] **Step 1: Write Playwright E2E Test**
  Create E2E test `tests/overtime-verification.spec.ts`:
  
  ```typescript
  import { test, expect } from "@playwright/test";
  
  test("Should allow configuring weekend overtime and displaying it", async ({ page }) => {
    await page.goto("http://localhost:4321/cronograma");
    
    // Switch to Extras tab
    const tab = page.locator("#switch-to-overtime-btn");
    await expect(tab).toBeVisible();
    await tab.click();
    
    // Check that timeline and form elements are loaded
    await expect(page.locator("#overtime-weekend-date")).toBeVisible();
    await expect(page.locator("#overtime-referente")).toBeVisible();
    await expect(page.locator("#add-overtime-shift-form")).toBeVisible();
  });
  ```

- [ ] **Step 2: Start Astro dev server and run Playwright test**
  Run: `npm run build` to verify production compiler is clean.
  Run: `npx playwright test tests/overtime-verification.spec.ts`
  Expected: Test passes successfully.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add tests/overtime-verification.spec.ts
  git commit -m "test: add E2E verification test for weekend overtime"
  ```
