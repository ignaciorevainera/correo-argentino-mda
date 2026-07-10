import type { InvgateResult } from "@/types/invgate";

function getEnv(key: string): string {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    //return (import.meta.env as any)[key] || "";
    const val = (import.meta.env as any)[key];
    if (val && typeof val === "string") return val;
  }
  return process.env[key] || "";
}

export async function invgateGet<T>(endpoint: string, timeoutMs = 15000): Promise<InvgateResult<T>> {
  const apiKey = getEnv("INVGATE_API_KEY");
  const baseUrl = getEnv("INVGATE_BASE_URL");
  const rawUsername = getEnv("INVGATE_API_USERNAME");

  if (!apiKey) {
    throw new Error("[InvGate] Variable de entorno INVGATE_API_KEY no definida.");
  }

  if (!baseUrl) {
    throw new Error("[InvGate] Variable de entorno INVGATE_BASE_URL no definida.");
  }

  const apiUsername = rawUsername || "portalmda";

  const credentials = btoa(apiUsername + ":" + apiKey);

  const headers = {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  const url = `${baseUrl}${endpoint}`;
  let lastStatus = 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    lastStatus = response.status;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `[InvGate] HTTP ${response.status}: ${response.statusText}`,
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
      message: `[InvGate] Error de red: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
