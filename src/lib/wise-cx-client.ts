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

  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBaseUrl}/core/v1/authenticate?user=${encodeURIComponent(user)}`;

  console.log("[Wise CX] Authenticating at:", url.replace(apiKey, "***"));

  const controller = new AbortController();
  const authTimeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      console.log("[Wise CX] Auth response body:", body);
      throw new Error(
        `[Wise CX] Autenticacion fallida: HTTP ${response.status} ${response.statusText}`,
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
  } finally {
    clearTimeout(authTimeout);
  }
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

  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBaseUrl}${path}`;
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
