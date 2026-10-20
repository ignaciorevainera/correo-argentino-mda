export function getInternalOrigin(request?: Request): string {
  const configured =
    import.meta.env?.INTERNAL_ORIGIN || process.env.INTERNAL_ORIGIN;
  if (configured) return configured.replace(/\/+$/, "");

  const fallback = `http://127.0.0.1:${process.env.PORT || 4321}`;

  if (request && import.meta.env?.DEV) {
    const { hostname, origin } = new URL(request.url);
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
      return origin;
    }
  }

  return fallback;
}

/**
 * Headers para los self-fetch internos por loopback.
 *
 * El middleware liga cada sesión al User-Agent (sha256) y la ELIMINA si no
 * coincide. Un self-fetch que solo reenvía `cookie` llega con el UA de Node
 * (undici) → mismatch → la sesión del usuario se destruye y el upstream
 * responde 302 a /login. Por eso hay que reenviar cookie + user-agent.
 */
export function getInternalFetchHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;
  return headers;
}
