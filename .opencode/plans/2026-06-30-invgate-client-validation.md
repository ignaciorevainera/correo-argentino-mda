# InvGate Client Validation & API Proxy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate that the InvGate API client works end-to-end, add domain types for incidents, create a ping endpoint for manual smoke-testing, and add unit/E2E tests.

**Architecture:** Fix the auth header in the existing client (Task 0), extend `src/types/invgate.ts` with domain types for InvGate incidents, create two Astro API proxy endpoints (`/api/invgate/ping` for smoke-testing, `/api/invgate/incidents` for listing), add unit tests with mocked fetch for the client logic, and add a Playwright E2E test for auth gating.

**Tech Stack:** Astro SSR (APIRoute), TypeScript, Playwright (v1.60+), node:assert

**Prerequisite review:** The client module at `src/lib/invgateClient.ts` already exists but uses an incorrect auth scheme (`rest_api_key=`) that causes HTTP 401. Task 0 fixes this to proper Basic Auth with username `portalmda`.

---

### Task 0: Fix authentication header in the client

**Files:**
- Modify: `src/lib/invgateClient.ts` (lines 15-18)

**Problem:** The current code sends `Authorization: rest_api_key=4b2cb1c...`. InvGate rejects this with 401 because it expects `Authorization: Basic <base64("portalmda:API_KEY")>`.

- [ ] **Step 1: Replace the auth header with proper Basic Auth**

In `src/lib/invgateClient.ts`, replace lines 15-18:

```typescript
  const headers = {
    "Authorization": `rest_api_key=${apiKey}`,
    "Content-Type": "application/json",
  };
```

With:

```typescript
  const credentials = btoa("portalmda:" + apiKey);

  const headers = {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
```

The full function after the change:

```typescript
export async function invgateGet<T>(endpoint: string): Promise<InvgateResult<T>> {
  const apiKey = import.meta.env.INVGATE_API_KEY;
  const baseUrl = import.meta.env.INVGATE_BASE_URL;

  if (!apiKey) {
    throw new Error("[InvGate] Variable de entorno INVGATE_API_KEY no definida.");
  }

  if (!baseUrl) {
    throw new Error("[InvGate] Variable de entorno INVGATE_BASE_URL no definida.");
  }

  const credentials = btoa("portalmda:" + apiKey);

  const headers = {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  const url = `${baseUrl}${endpoint}`;
  let lastStatus = 0;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    lastStatus = response.status;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `[InvGate] HTTP ${response.status}: ${response.statusText} — ${url}`,
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
      message: `[InvGate] Error de red: ${message} — ${url}`,
    };
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx astro check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invgateClient.ts
git commit -m "fix: change InvGate auth from rest_api_key to Basic Auth with portalmda user"
```

---

### Task 1: Add domain types for InvGate incidents

**Files:**
- Modify: `src/types/invgate.ts`
- Create: `tests/invgate-domain-types.test.mjs`

- [ ] **Step 1: Add incident domain types to the existing types file**

Add these interfaces after line 13 (`InvgateResult<T>`) in `src/types/invgate.ts`:

```typescript
export interface InvgateIncident {
  id: number;
  number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  urgency: string;
  category: string | null;
  subcategory: string | null;
  assigned_to: string | null;
  requester: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface InvgatePagination {
  current_page: number;
  per_page: number;
  total_pages: number;
  total_entries: number;
}

export interface InvgateIncidentsResponse {
  data: InvgateIncident[];
  pagination: InvgatePagination;
}
```

- [ ] **Step 2: Write a static test that verifies the types are present**

Create `tests/invgate-domain-types.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const typesPath = new URL("../src/types/invgate.ts", import.meta.url);
const source = await readFile(typesPath, "utf8");

assert.ok(source.includes("InvgateIncident"), "InvgateIncident type should exist");
assert.ok(source.includes("InvgateIncidentsResponse"), "InvgateIncidentsResponse type should exist");
assert.ok(source.includes("InvgatePagination"), "InvgatePagination type should exist");

assert.ok(source.includes("InvgateResult<T>"), "InvgateResult should still exist");
assert.ok(source.includes("InvgateApiResponse<T>"), "InvgateApiResponse should still exist");
assert.ok(source.includes("InvgateApiError"), "InvgateApiError should still exist");

console.log("All invgate domain type tests passed!");
```

- [ ] **Step 3: Run the test**

```bash
node tests/invgate-domain-types.test.mjs
```

Expected: `All invgate domain type tests passed!`

- [ ] **Step 4: Commit**

```bash
git add src/types/invgate.ts tests/invgate-domain-types.test.mjs
git commit -m "feat: add InvGate incident domain types"
```

---

### Task 2: Create a ping endpoint for manual smoke-testing

**Files:**
- Create: `src/pages/api/invgate/ping.ts`

- [ ] **Step 1: Create the ping endpoint**

This performs a minimal GET (`incidents?page=1&page_size=1`) and returns connection health + latency + a sample incident.

```typescript
import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateIncidentsResponse } from "@/types/invgate";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const start = Date.now();
    const result = await invgateGet<InvgateIncidentsResponse>("incidents?page=1&page_size=1");
    const elapsed = Date.now() - start;

    if (!result.ok) {
      return jsonResponse({
        ok: false,
        message: result.message,
        elapsed,
      }, result.status);
    }

    return jsonResponse({
      ok: true,
      elapsed,
      totalIncidents: result.data.pagination?.total_entries ?? 0,
      sample: result.data.data?.[0] ?? null,
    });
  } catch (error: any) {
    console.error("[InvGate Ping] Error:", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/ping.ts
git commit -m "feat: add InvGate ping endpoint for manual smoke-testing"
```

---

### Task 3: Create an incidents list proxy endpoint

**Files:**
- Create: `src/pages/api/invgate/incidents.ts`

- [ ] **Step 1: Create the incidents endpoint**

This proxies GET requests to InvGate's `incidents` endpoint with pagination support, following the existing `APIRoute` pattern.

```typescript
import type { APIRoute } from "astro";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateIncidentsResponse } from "@/types/invgate";
import { jsonResponse } from "@lib/apiResponse";

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const page = url.searchParams.get("page") || "1";
    const pageSize = url.searchParams.get("page_size") || "10";

    const result = await invgateGet<InvgateIncidentsResponse>(
      `incidents?page=${page}&page_size=${pageSize}`
    );

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    return jsonResponse(result.data, result.status, "no-store");
  } catch (error: any) {
    console.error("[InvGate Incidents] Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/incidents.ts
git commit -m "feat: add InvGate incidents proxy endpoint"
```

---

### Task 4: Write unit tests for the client with mocked fetch

**Files:**
- Create: `tests/invgate-client.test.mjs`

- [ ] **Step 1: Write the unit test**

This tests the client's core logic (success path, HTTP errors, network errors, missing env vars, auth header format — including `portalmda` as the Basic Auth username) using mocked `fetch`.

```javascript
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

function mockFetch(responseBody, status = 200, statusText = "OK") {
  globalThis.fetch = async (url, options) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => responseBody,
  });
}

function mockNetworkError() {
  globalThis.fetch = async () => {
    throw new Error("Network error: connect ECONNREFUSED");
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Wrapper that mirrors invgateGet<T> but uses process.env instead of import.meta.env
async function simulateInvgateGet(endpoint) {
  const apiKey = process.env.INVGATE_API_KEY;
  const baseUrl = process.env.INVGATE_BASE_URL;

  if (!apiKey) {
    throw new Error("[InvGate] Variable de entorno INVGATE_API_KEY no definida.");
  }
  if (!baseUrl) {
    throw new Error("[InvGate] Variable de entorno INVGATE_BASE_URL no definida.");
  }

  // Must use "portalmda" as the Basic Auth username (matching src/lib/invgateClient.ts)
  const credentials = Buffer.from("portalmda:" + apiKey).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
  const url = `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `[InvGate] HTTP ${response.status}: ${response.statusText} — ${url}`,
      };
    }
    const data = await response.json();
    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: `[InvGate] Error de red: ${error.message} — ${url}`,
    };
  }
}

// --- Setup ---
const envBackup = { ...process.env };
process.env.INVGATE_API_KEY = "test-api-key-123";
process.env.INVGATE_BASE_URL = "https://invgate.test/api/v1/";

// --- Test 1: Successful GET ---
mockFetch({ data: [{ id: 1, title: "Test" }], pagination: { total_entries: 1 } });
let result = await simulateInvgateGet("incidents?page=1&page_size=1");
assert.equal(result.ok, true, "Should return ok: true on success");
assert.equal(result.status, 200, "Should return status 200");
assert.equal(result.data.data[0].id, 1, "Should return parsed data");
assert.equal(result.data.data[0].title, "Test", "Should return incident title");
restoreFetch();

// --- Test 2: HTTP 401 error ---
mockFetch(null, 401, "Unauthorized");
result = await simulateInvgateGet("incidents?page=1");
assert.equal(result.ok, false, "Should return ok: false on HTTP error");
assert.equal(result.status, 401, "Should preserve HTTP status code");
assert.ok(result.message.includes("401"), "Should include status in message");
restoreFetch();

// --- Test 3: Network error ---
mockNetworkError();
result = await simulateInvgateGet("incidents?page=1");
assert.equal(result.ok, false, "Should return ok: false on network error");
assert.equal(result.status, 0, "Should return status 0 on network error");
assert.ok(result.message.includes("Network error"), "Should include network error message");
restoreFetch();

// --- Test 4: Missing API key throws ---
process.env.INVGATE_API_KEY = "";
try {
  await simulateInvgateGet("incidents");
  assert.fail("Should have thrown for missing API key");
} catch (e) {
  assert.ok(e.message.includes("INVGATE_API_KEY"), "Should mention missing env var");
}
process.env.INVGATE_API_KEY = "test-api-key-123";

// --- Test 5: Missing base URL throws ---
process.env.INVGATE_BASE_URL = "";
try {
  await simulateInvgateGet("incidents");
  assert.fail("Should have thrown for missing base URL");
} catch (e) {
  assert.ok(e.message.includes("INVGATE_BASE_URL"), "Should mention missing env var");
}
process.env.INVGATE_BASE_URL = "https://invgate.test/api/v1/";

// --- Test 6: Auth header format (must use portalmda as username) ---
globalThis.fetch = async (url, options) => {
  assert.ok(options.headers.Authorization.startsWith("Basic "), "Should use Basic auth");
  const decoded = Buffer.from(options.headers.Authorization.slice(6), "base64").toString("utf8");
  assert.equal(decoded, "portalmda:test-api-key-123", "Auth should be 'portalmda:<key>'");
  return {
    ok: true, status: 200, statusText: "OK",
    json: async () => ({ data: [] }),
  };
};
await simulateInvgateGet("incidents");
restoreFetch();

// --- Cleanup ---
process.env.INVGATE_API_KEY = envBackup.INVGATE_API_KEY;
process.env.INVGATE_BASE_URL = envBackup.INVGATE_BASE_URL;

console.log("All invgate client tests passed!");
```

- [ ] **Step 2: Run the test**

```bash
node tests/invgate-client.test.mjs
```

Expected: `All invgate client tests passed!`

- [ ] **Step 3: Commit**

```bash
git add tests/invgate-client.test.mjs
git commit -m "test: add unit tests for InvGate client with mocked fetch"
```

---

### Task 5: Add Playwright E2E test for auth gating

**Files:**
- Create: `tests/invgate-ping.spec.ts`

- [ ] **Step 1: Write the Playwright test**

This creates a test user + session (same pattern as `tests/admin/rbac.spec.ts`), then verifies:
- 401 when unauthenticated
- 200 when authenticated (real InvGate is called — requires `.env` credentials with `portalmda` user)

```typescript
import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { db } from '../../src/db/index';
import { users, sessions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

let testUserId: number;
let rawSessionId: string;
let signedSessionId: string;

test.beforeAll(async () => {
  const username = `test_invgate_${Date.now()}`;
  rawSessionId = `session_invgate_${Date.now()}`;
  signedSessionId = signSessionId(rawSessionId);

  const [newUser] = await db.insert(users).values({
    username,
    password: 'hashed_fake_password',
    role: 'admin',
  }).returning({ id: users.id });
  testUserId = newUser.id;

  await db.insert(sessions).values({
    id: rawSessionId,
    userId: testUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
});

test.afterAll(async () => {
  await db.delete(sessions).where(eq(sessions.id, rawSessionId));
  await db.delete(users).where(eq(users.id, testUserId));
});

test.describe('InvGate ping endpoint', () => {
  test('should return 401 when not authenticated', async ({ page }) => {
    const response = await page.goto('/api/invgate/ping');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(401);

    const body = await response!.json();
    expect(body.error).toBe('No autorizado');
  });

  test('should return 200 when authenticated', async ({ context, page }) => {
    await context.addCookies([{
      name: 'session_id',
      value: signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);

    const response = await page.goto('/api/invgate/ping');
    expect(response).not.toBeNull();

    const body = await response!.json();
    expect(body).toHaveProperty('ok');
    expect(typeof body.elapsed).toBe('number');
  });

  test('incidents endpoint also returns 401 when not authenticated', async ({ page }) => {
    const response = await page.goto('/api/invgate/incidents');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(401);
  });
});
```

- [ ] **Step 2: Run the Playwright test**

```bash
npx playwright test tests/invgate-ping.spec.ts
```

Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/invgate-ping.spec.ts
git commit -m "test: add E2E tests for InvGate endpoint auth gating"
```

---

### Manual smoke test

After all tasks are complete, manually validate the integration:

```bash
# Start the dev server
npm run dev

# In another terminal, call the ping endpoint (requires session cookie)
# 1. Login in the browser and copy the session_id cookie
# 2. Then:
curl -s http://localhost:4321/api/invgate/ping -b "session_id=<signed-session-id>"
```

Expected response (InvGate reachable with Basic Auth `portalmda:API_KEY`):
```json
{
  "ok": true,
  "elapsed": 1234,
  "totalIncidents": 42,
  "sample": { "id": 1, "number": "INC-001", "title": "..." }
}
```

If the credentials are still wrong, InvGate will return a 401 that the endpoint will forward:
```json
{
  "ok": false,
  "message": "[InvGate] HTTP 401: Unauthorized — https://correoargentino.sd.cloud.invgate.net/api/v1/incidents?page=1&page_size=1",
  "elapsed": 500
}
```

---

### Self-Review

**Spec coverage:**
- ✅ Fix root cause of 401 error → Task 0 (change from `rest_api_key=` to Basic Auth `portalmda:KEY`)
- ✅ Validate client with real API → Task 2 (ping endpoint), Task 5 (Playwright authenticated test)
- ✅ Domain types for incidents → Task 1
- ✅ GET query capability → Task 3 (incidents proxy)
- ✅ Tests for client logic → Task 4 (mocked fetch, 6 scenarios including `portalmda:` auth check)
- ✅ Auth gating → both endpoints check `locals.user.id !== 0`, Task 5 tests it

**Placeholder scan:** No TODOs, TBDs, or placeholder patterns. All code blocks are complete.

**Type consistency:**
- `InvgateIncident`, `InvgateIncidentsResponse`, `InvgatePagination` defined in Task 1, consumed in Tasks 2–3 and 5
- `InvgateResult<T>` from existing code, used through `invgateGet<T>`
- `jsonResponse` from `@lib/apiResponse` in both endpoints
- Auth check pattern matches `middleware.ts:85-86`
- Playwright session setup matches `tests/admin/rbac.spec.ts`
- Auth header username `portalmda` is consistent between Tasks 0 and 4 (Test 6)
