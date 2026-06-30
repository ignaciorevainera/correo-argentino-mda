import type { InvgateResult } from "@/types/invgate";

export async function invgateGet<T>(endpoint: string): Promise<InvgateResult<T>> {
  const apiKey = import.meta.env.INVGATE_API_KEY;
  const baseUrl = import.meta.env.INVGATE_BASE_URL;
  const rawUsername = import.meta.env.INVGATE_API_USERNAME;

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
