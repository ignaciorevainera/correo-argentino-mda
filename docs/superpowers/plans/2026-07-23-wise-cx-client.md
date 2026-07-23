# Wise CX API Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable Wise CX API client with JWT token authentication, automatic re-auth on expiry/403, and support for GET/POST/PUT/DELETE.

**Architecture:** JWT-based auth flow (`GET /core/v1/authenticate?user=X` with `x-api-key` header returns JWT valid 3600s). Token cached in-memory with 55min TTL. Auto-reauth on 403 by clearing cache and retrying once. All requests carry both `Authorization: Bearer TOKEN` and `x-api-key` headers.

**Tech Stack:** TypeScript, fetch API, no external deps.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `.env.example` | Modify | Add `WISE_CX_BASE_URL`, `WISE_CX_API_KEY`, `WISE_CX_API_USER` |
| `src/lib/wise-cx-client.ts` | **Create** | Full client: `wiseCxGet`, `wiseCxPost`, `wiseCxPut`, `wiseCxDelete` |
| `docs/superpowers/plans/2026-07-23-wise-cx-client.md` | **Create** | This plan |

---

### Task 1: Add Wise CX env vars to .env.example

**Files:**
- Modify: `.env.example`

Append after existing env vars:

```
# --- Wise CX API ---
WISE_CX_BASE_URL="https://api.wcx.cloud"
WISE_CX_API_KEY=""
WISE_CX_API_USER=""
# Generate API key: Settings → Canales → Api in Wise CX dashboard.
# WISE_CX_API_USER is the username registered when generating the key.
```

Commit: `feat: add Wise CX env vars to .env.example`

---

### Task 2: Create wise-cx-client.ts

**Files:**
- Create: `src/lib/wise-cx-client.ts`

Full implementation:

```typescript
// src/lib/wise-cx-client.ts
import type { InvgateResult } from "@/types/invgate";

function getEnv(key: string): string {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const val = (import.meta.env as any)[key];
    if (val && typeof val === "string") return val;
  }
  return process.env[key] || "";
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const apiKey = getEnv("WISE_CX_API_KEY");
  const baseUrl = getEnv("WISE_CX_BASE_URL");
  const user = getEnv("WISE_CX_API_USER");

  if (!apiKey) throw new Error("[Wise CX] WISE_CX_API_KEY no definida.");
  if (!baseUrl) throw new Error("[Wise CX] WISE_CX_BASE_URL no definida.");
  if (!user) throw new Error("[Wise CX] WISE_CX_API_USER no definida.");

  const url = `${baseUrl}/core/v1/authenticate?user=${encodeURIComponent(user)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(
      `[Wise CX] Autenticacion fallida: HTTP ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const token = data.token || data.access_token || data.jwt;
  if (!token) throw new Error("[Wise CX] Token no encontrado en respuesta de autenticacion.");

  tokenCache = {
    token,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };

  console.log("[Wise CX] Token obtenido, valido hasta:", new Date(tokenCache.expiresAt).toISOString());
  return token;
}

function clearToken(): void {
  tokenCache = null;
  console.log("[Wise CX] Token cache invalidado.");
}

async function wiseCxRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  timeoutMs = 30000,
  isRetry = false,
): Promise<InvgateResult<T>> {
  const apiKey = getEnv("WISE_CX_API_KEY");
  const baseUrl = getEnv("WISE_CX_BASE_URL");

  if (!apiKey) {
    return { ok: false, status: 0, message: "[Wise CX] WISE_CX_API_KEY no definida." };
  }
  if (!baseUrl) {
    return { ok: false, status: 0, message: "[Wise CX] WISE_CX_BASE_URL no definida." };
  }

  let token: string;
  try {
    token = await getToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de autenticacion";
    return { ok: false, status: 0, message: msg };
  }

  const url = `${baseUrl}${path}`;
  let lastStatus = 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };

    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    lastStatus = response.status;

    if (response.status === 403 && !isRetry) {
      console.log("[Wise CX] 403 recibido, re-autenticando...");
      clearToken();
      return wiseCxRequest<T>(method, path, body, timeoutMs, true);
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `[Wise CX] HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, status: response.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return {
      ok: false,
      status: lastStatus,
      message: `[Wise CX] Error de red: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function wiseCxGet<T>(path: string, timeoutMs?: number): Promise<InvgateResult<T>> {
  return wiseCxRequest<T>("GET", path, undefined, timeoutMs);
}

export async function wiseCxPost<T>(path: string, body: unknown, timeoutMs?: number): Promise<InvgateResult<T>> {
  return wiseCxRequest<T>("POST", path, body, timeoutMs);
}

export async function wiseCxPut<T>(path: string, body: unknown, timeoutMs?: number): Promise<InvgateResult<T>> {
  return wiseCxRequest<T>("PUT", path, body, timeoutMs);
}

export async function wiseCxDelete<T>(path: string, timeoutMs?: number): Promise<InvgateResult<T>> {
  return wiseCxRequest<T>("DELETE", path, undefined, timeoutMs);
}
```

Commit: `feat: add wise-cx-client with JWT auth, token cache, GET/POST/PUT/DELETE`

---

### Task 3: Build and verify

Run: `npm run build`
Expected: No errors.
