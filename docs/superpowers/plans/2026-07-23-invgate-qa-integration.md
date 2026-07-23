# InvGate QA API Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate QA/test InvGate API key, a reusable QA client with full HTTP method support, and a status card on `/admin` showing connection health.

**Architecture:** New `invgate-qa-client.ts` mirrors the existing `invgateClient.ts` pattern but uses `INVGATE_QA_API_KEY`, `INVGATE_QA_BASE_URL`, `INVGATE_QA_API_USERNAME` (separate QA server, not production) and extends support to POST/PUT/DELETE. A server API endpoint checks connectivity via `sd.version`. An Astro card component renders the status with client-side JS for refresh. No DB changes.

**Tech Stack:** Astro SSR, TypeScript, fetch API, DaisyUI 5 / Tailwind v4, astro-icon

---

## File Structure

| File | Action | Responsibility |
|---|---|---|---|
| `.env.example` | Modify | Add `INVGATE_QA_API_KEY`, `INVGATE_QA_BASE_URL`, `INVGATE_QA_API_USERNAME` placeholders |
| `src/lib/invgate-qa-client.ts` | **Create** | QA API client: `invgateQaGet`, `invgateQaPost`, `invgateQaPut`, `invgateQaDelete` |
| `src/pages/api/admin/invgate-qa-status.ts` | **Create** | API endpoint: checks QA connection via `sd.version` |
| `src/components/ui/AdminInvGateQAStatusCard.astro` | **Create** | Card with status text, color-coding, refresh button |
| `src/pages/admin/index.astro` | Modify | Import and render the new card |
| `src/middleware.ts` | Modify | Protect `/api/admin/invgate-qa-status` (already covered by `/api/admin` prefix) |

---

### Task 1: Add QA env vars to .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the new env vars**

Open `.env.example`. After the existing InvGate section (line 27), append:

```
# --- InvGate QA API (test environment) ---
INVGATE_QA_API_USERNAME="portalmda"
INVGATE_QA_BASE_URL="https://correoargentino-qa.sd.cloud.invgate.net/api/v1/"
INVGATE_QA_API_KEY=""
# QA/test environment. Separate server from production. Use for testing requests that edit sensitive data.
```

The full `.env.example` should now end with:

```
ENCRYPTION_KEY=""
# A 32-character hex string for AES-256-GCM encryption of credentials.
# Generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# --- InvGate API ---
INVGATE_API_USERNAME="portalmda"
INVGATE_BASE_URL="https://correoargentino.sd.cloud.invgate.net/api/v1/"
INVGATE_API_KEY=""

# --- InvGate QA API (test environment) ---
INVGATE_QA_API_USERNAME="portalmda"
INVGATE_QA_BASE_URL="https://correoargentino-qa.sd.cloud.invgate.net/api/v1/"
INVGATE_QA_API_KEY=""
# QA/test environment. Separate server from production. Use for testing requests that edit sensitive data.
```

- [ ] **Step 2: Verify the file is valid**

Run: `git diff .env.example`
Expected: Shows the addition of `INVGATE_QA_API_KEY` and its comment block.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "feat: add INVGATE_QA_API_KEY env var placeholder"
```

**Note to human:** You must manually add the actual QA API key value to your `.env` file:
```
INVGATE_QA_API_KEY="<your-qa-key-here>"
```

---

### Task 2: Create QA client with GET/POST/PUT/DELETE

**Files:**
- Create: `src/lib/invgate-qa-client.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/invgate-qa-client.ts
import type { InvgateResult } from "@/types/invgate";

function getEnv(key: string): string {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const val = (import.meta.env as any)[key];
    if (val && typeof val === "string") return val;
  }
  return process.env[key] || "";
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

async function invgateQaRequest<T>(
  method: HttpMethod,
  endpoint: string,
  body?: unknown,
  timeoutMs = 15000,
): Promise<InvgateResult<T>> {
  const apiKey = getEnv("INVGATE_QA_API_KEY");
  const baseUrl = getEnv("INVGATE_QA_BASE_URL");
  const rawUsername = getEnv("INVGATE_QA_API_USERNAME");

  if (!apiKey) {
    throw new Error("[InvGate QA] Variable de entorno INVGATE_QA_API_KEY no definida.");
  }

  if (!baseUrl) {
    throw new Error("[InvGate QA] Variable de entorno INVGATE_QA_BASE_URL no definida.");
  }

  const apiUsername = rawUsername || "portalmda";

  const credentials = btoa(apiUsername + ":" + apiKey);

  const headers: Record<string, string> = {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  const url = `${baseUrl}${endpoint}`;
  let lastStatus = 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    lastStatus = response.status;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `[InvGate QA] HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as T;

    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return {
      ok: false,
      status: lastStatus,
      message: `[InvGate QA] Error de red: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function invgateQaGet<T>(endpoint: string, timeoutMs?: number): Promise<InvgateResult<T>> {
  return invgateQaRequest<T>("GET", endpoint, undefined, timeoutMs);
}

export async function invgateQaPost<T>(endpoint: string, body: unknown, timeoutMs?: number): Promise<InvgateResult<T>> {
  return invgateQaRequest<T>("POST", endpoint, body, timeoutMs);
}

export async function invgateQaPut<T>(endpoint: string, body: unknown, timeoutMs?: number): Promise<InvgateResult<T>> {
  return invgateQaRequest<T>("PUT", endpoint, body, timeoutMs);
}

export async function invgateQaDelete<T>(endpoint: string, timeoutMs?: number): Promise<InvgateResult<T>> {
  return invgateQaRequest<T>("DELETE", endpoint, undefined, timeoutMs);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/invgate-qa-client.ts`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invgate-qa-client.ts
git commit -m "feat: add invgate-qa-client with GET/POST/PUT/DELETE support"
```

---

### Task 3: Create API endpoint for QA connection status check

**Files:**
- Create: `src/pages/api/admin/invgate-qa-status.ts`

- [ ] **Step 1: Create the API endpoint file**

```typescript
// src/pages/api/admin/invgate-qa-status.ts
import type { APIRoute } from "astro";
import { invgateQaGet } from "@/lib/invgate-qa-client";
import { jsonResponse } from "@/lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const result = await invgateQaGet<{ version: string }>("sd.version");

  return jsonResponse({
    ok: result.ok,
    status: result.status,
    message: result.ok
      ? "Conexión exitosa (QA)"
      : ("message" in result ? result.message : "Fallo de conexión (QA)"),
  });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/pages/api/admin/invgate-qa-status.ts`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/invgate-qa-status.ts
git commit -m "feat: add /api/admin/invgate-qa-status endpoint"
```

---

### Task 4: Create AdminInvGateQAStatusCard component

**Files:**
- Create: `src/components/ui/AdminInvGateQAStatusCard.astro`

- [ ] **Step 1: Create the card component**

```astro
---
// src/components/ui/AdminInvGateQAStatusCard.astro
import { Icon } from "astro-icon/components";
---

<div
  class="card bg-base-100 border border-base-300 flex flex-row items-center justify-between p-5 md:p-6"
>
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2">
      <div
        class="text-xs font-semibold uppercase tracking-wider text-base-content/60 truncate"
      >
        InvGate QA (Test)
      </div>
      <button
        type="button"
        id="invgate-qa-refresh-btn"
        class="btn btn-ghost btn-circle btn-xs text-base-content/50 hover:text-base-content focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        title="Verificar conexión de InvGate QA"
        aria-label="Verificar conexión de InvGate QA"
      >
        <Icon
          name="boxicons:refresh-ccw-filled"
          size={14}
          id="invgate-qa-refresh-icon"
        />
      </button>
    </div>
    <div
      class="text-lg md:text-xl font-bold mt-0.5"
      id="invgate-qa-status"
    >
      Cargando...
    </div>
    <div class="text-xs text-base-content/50 mt-1 truncate" id="invgate-qa-desc">
      Esperando datos...
    </div>
    <div class="mt-1">
      <a
        href="https://releases.invgate.com/service-desk/api/"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs link link-secondary link-hover"
      >
        Documentacion de la API
      </a>
    </div>
  </div>
  <div
    class="bg-base-200/60 text-base-content/40 p-3 rounded-xl shrink-0 ml-4"
    id="invgate-qa-icon-container"
  >
    <Icon name="boxicons:flask-filled" size={32} />
  </div>
</div>

<script>
  const invgateQaStatusEl = document.getElementById("invgate-qa-status");
  const invgateQaDescEl = document.getElementById("invgate-qa-desc");
  const invgateQaIconContainer = document.getElementById("invgate-qa-icon-container");
  const invgateQaRefreshBtn = document.getElementById("invgate-qa-refresh-btn");
  const invgateQaRefreshIcon = document.getElementById("invgate-qa-refresh-icon");

  async function updateInvgateQaStatus() {
    if (!invgateQaStatusEl) return;

    if (invgateQaRefreshIcon) {
      invgateQaRefreshIcon.classList.add("animate-spin");
    }
    if (invgateQaRefreshBtn) {
      invgateQaRefreshBtn.setAttribute("disabled", "true");
    }

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 15000);

    try {
      const res = await fetch("/api/admin/invgate-qa-status", { signal: ac.signal });
      if (!res.ok) throw new Error("Error en la respuesta de la API");

      const data = await res.json();

      let statusText = "Desconectado";
      let statusClass = "text-error";
      let iconContainerClass = "bg-error/15 text-error p-3 rounded-xl shrink-0 ml-4";

      if (data.ok) {
        statusText = "Conectado";
        statusClass = "text-success";
        iconContainerClass = "bg-success/15 text-success p-3 rounded-xl shrink-0 ml-4";
      }

      invgateQaStatusEl.textContent = statusText;
      invgateQaStatusEl.className = `text-lg md:text-xl font-bold mt-0.5 ${statusClass}`;

      if (invgateQaDescEl) {
        const descText = data.message || `HTTP ${data.status}`;
        invgateQaDescEl.textContent = descText;
        invgateQaDescEl.title = descText;
      }

      if (invgateQaIconContainer) {
        invgateQaIconContainer.className = iconContainerClass;
      }
    } catch (err) {
      console.error("[AdminInvGateQAStatusCard] Error al verificar InvGate QA:", err);
      invgateQaStatusEl.textContent = "Error de Conexion";
      invgateQaStatusEl.className = "text-lg md:text-xl font-bold mt-0.5 text-warning";
      if (invgateQaIconContainer) {
        invgateQaIconContainer.className = "bg-warning/15 text-warning p-3 rounded-xl shrink-0 ml-4";
      }
    } finally {
      clearTimeout(timeout);
      if (invgateQaRefreshIcon) {
        invgateQaRefreshIcon.classList.remove("animate-spin");
      }
      if (invgateQaRefreshBtn) {
        invgateQaRefreshBtn.removeAttribute("disabled");
      }
    }
  }

  function initQaCard() {
    const btn = document.getElementById("invgate-qa-refresh-btn");
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        updateInvgateQaStatus();
      };
    }
    updateInvgateQaStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initQaCard);
  } else {
    initQaCard();
  }
  document.addEventListener("astro:page-load", initQaCard);
</script>
```

- [ ] **Step 2: Verify syntax**

Run: `npx tsc --noEmit src/components/ui/AdminInvGateQAStatusCard.astro` (Astro components don't need tsc; skip)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/AdminInvGateQAStatusCard.astro
git commit -m "feat: add AdminInvGateQAStatusCard component for /admin"
```

---

### Task 5: Integrate card into /admin page

**Files:**
- Modify: `src/pages/admin/index.astro`

- [ ] **Step 1: Import the component and add it to the page**

In `src/pages/admin/index.astro`, add the import near the existing imports (after line 7):

```astro
import AdminInvGateQAStatusCard from "@components/ui/AdminInvGateQAStatusCard.astro";
```

Then add a new standalone card grid section just before the `modulesGroup1` card section (before line 104):

```astro
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
      <AdminInvGateQAStatusCard />
    </div>
```

The relevant section of the file will look like:

```astro
    <SyncDashboard />

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
      <AdminInvGateQAStatusCard />
    </div>

    <div
      class="card bg-base-100 border border-base-300 divide-y divide-base-200 overflow-hidden"
    >
      {
        modulesGroup1.map((mod) => {
```

- [ ] **Step 2: Verify the file is valid**

Run: `npx astro check 2>&1 | Select-String "admin/index"`
Expected: No errors related to `admin/index.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/index.astro
git commit -m "feat: add InvGate QA status card to /admin dashboard"
```

---

### Task 6: Verify middleware protection covers the new route

**Files:**
- Verify: `src/middleware.ts`

- [ ] **Step 1: Confirm `/api/admin/` prefix already protects the new endpoint**

Check `src/middleware.ts:172-176`. The existing check:

```typescript
  if (
    lowerPath.startsWith("/api/cronograma") ||
    lowerPath.startsWith("/api/disponibilidad") ||
    lowerPath.startsWith("/api/asistencia") ||
    lowerPath.startsWith("/api/calidad") ||
    lowerPath.startsWith("/api/admin") ||
    lowerPath.startsWith("/api/export")
  ) {
```

The new endpoint `/api/admin/invgate-qa-status` starts with `/api/admin`, so it is already protected. No changes needed to `middleware.ts`.

- [ ] **Step 2: Verify no changes needed to rbac.ts**

The new endpoint is under `/api/admin/` which doesn't match any `routePermissions` entry (those target `/admin` page routes, not API routes). API endpoints use auth check via `locals.user.id === 0` in the endpoint itself (already implemented in Task 3). No changes needed to `rbac.ts`.

- [ ] **Step 3: Commit (skip — no changes)**

No code changes in this task. Mark as verified.

---

### Task 7: Verify app builds and runs correctly

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 2: Run dev server and verify the card renders**

Run: `npm run dev`

Navigate to `http://localhost:4321/admin` (after logging in). The QA card should appear below the SyncDashboard with status "Cargando..." then update to "Conectado" or "Desconectado" depending on whether `INVGATE_QA_API_KEY` is set and valid.

- [ ] **Step 3: Verify refresh button works**

Click the refresh icon on the QA card. The icon should spin and the status should re-check.

- [ ] **Step 4: Verify existing InvGate card still works**

The existing InvGate module in SyncDashboard should continue to work independently from the QA card.

- [ ] **Step 5: Commit (if any fixes needed)**

If build/dev succeeds with no changes: no commit needed.

---

## Self-Review

### 1. Spec coverage
- [x] Nueva variable `.env`: `INVGATE_QA_API_KEY` — Task 1
- [x] Archivos actualizados para incluir nueva configuracion y rutas — Task 1 (.env.example), Task 5 (admin page), Task 6 (middleware verification)
- [x] Funcion en `src/lib/invgate-qa-client.ts` con GET/POST/PUT/DELETE — Task 2
- [x] Nueva tarjeta en `/admin` mostrando estado de conexion — Task 4 + Task 5

### 2. Placeholder scan
No TBD, TODO, or placeholder patterns found. All code is complete.

### 3. Type consistency
- `invgateQaGet`, `invgateQaPost`, `invgateQaPut`, `invgateQaDelete` all use `InvgateResult<T>` from `@/types/invgate` (same as existing client)
- API endpoint imports `invgateQaGet` from the correct path
- Card component uses correct DOM IDs and matches the endpoint path `/api/admin/invgate-qa-status`
- All function names are consistent across tasks
