# Saturday Shift Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Saturday shift rotation with preconfigured groups, modular scheduling, and calendar integration in the Correo Argentino MDA project.

**Architecture:** Apply a dynamic modulo arithmetic calculation in the schedule API (`GET /api/cronograma`) to resolve active groups and modular sub-schedules on Saturdays unless overridden in the database with `is_override: true`. The client-side dashboard toggles a new Groups tab for settings and member management.

**Tech Stack:** Astro, Node.js, SQLite, Drizzle ORM, Tailwind CSS, DaisyUI, Playwright/Node test.

---

### Task 1: Database Schema Modifications
**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1.1: Add schema elements**
  Add `saturdayGroup` and `saturdayHorario` to `agents` table. Add `isOverride` to `schedules` table. Define new table `saturdayRotationConfig`.
- [ ] **Step 1.2: Apply schema migration**
  Run: `npx drizzle-kit push`
- [ ] **Step 1.3: Commit database modifications**
  Run: `git add src/db/schema.ts && git commit -m "db: add saturday rotation columns and config table"`

### Task 2: API Endpoints Implementation
**Files:**
- Create: `src/pages/api/cronograma/rotation-config.ts`
- Create: `src/pages/api/cronograma/rotation-groups/members.ts`
- Modify: `src/pages/api/cronograma/index.ts`
- Modify: `src/pages/api/cronograma/months/index.ts`

- [ ] **Step 2.1: Implement rotation-config API**
  Write GET and POST methods for `src/pages/api/cronograma/rotation-config.ts`.
- [ ] **Step 2.2: Implement group members API**
  Write POST method for `src/pages/api/cronograma/rotation-groups/members.ts`.
- [ ] **Step 2.3: Modify cronograma GET and POST endpoint**
  Implement Saturday calculation logic and `isOverride` saving in `src/pages/api/cronograma/index.ts`.
- [ ] **Step 2.4: Update month initialization**
  Set `isOverride: false` in `src/pages/api/cronograma/months/index.ts`.
- [ ] **Step 2.5: Commit API modifications**
  Run: `git add src/pages/api/cronograma && git commit -m "api: implement rotation endpoints and calculation logic"`

### Task 3: UI Integration (Groups View)
**Files:**
- Modify: `src/components/cronograma/CronogramaDashboard.astro`
- Modify: `src/components/cronograma/lib/dashboard-client.ts`

- [ ] **Step 3.1: Update HTML layout and view-switcher**
  Add "Grupos" button and `#groups-view` template in `src/components/cronograma/CronogramaDashboard.astro`.
- [ ] **Step 3.2: Implement Groups tab controller**
  Handle view switcher, forms and member list rendering in `src/components/cronograma/lib/dashboard-client.ts`.
- [ ] **Step 3.3: Add rotation tag attribute to Saturdays**
  Update monthly render in `dashboard-client.ts` to set `data-saturday-rotation="true"` for calculated Saturday cells.
- [ ] **Step 3.4: Implement calendar cell click redirection**
  Intercept click events on `data-saturday-rotation="true"` cells and trigger tab switch to Groups.
- [ ] **Step 3.5: Commit UI integrations**
  Run: `git add src/components/cronograma && git commit -m "ui: implement groups view and calendar click redirection"`

### Task 4: Testing & Verification
**Files:**
- Create: `tests/saturday-rotation.test.mjs`

- [ ] **Step 4.1: Write playwright verification test**
  Write a test file `tests/saturday-rotation.test.mjs` to run against dev environment.
- [ ] **Step 4.2: Execute test and confirm pass**
  Run: `node tests/saturday-rotation.test.mjs`
  Expected: PASS
- [ ] **Step 4.3: Commit tests**
  Run: `git add tests/saturday-rotation.test.mjs && git commit -m "test: add saturday rotation verification test"`
