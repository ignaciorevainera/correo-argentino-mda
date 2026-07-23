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
