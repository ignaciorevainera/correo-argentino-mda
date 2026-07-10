export function jsonResponse(data: unknown, status = 200, cacheControl?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cacheControl) {
    headers["Cache-Control"] = cacheControl;
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export function jsonError(message: string, status = 400, cacheControl?: string) {
  return jsonResponse({ error: message }, status, cacheControl);
}

export function sanitizeError(error: unknown, genericMsg = "Error interno del servidor"): string {
  if (import.meta.env.DEV) {
    return error instanceof Error ? error.message : String(error);
  }
  return genericMsg;
}
