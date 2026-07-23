import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index";
import { users, sessions } from "./db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "./lib/session";
import { hasPermission } from "./lib/rbac";
import { resolveUrl } from "./lib/url";
import { getCleanBase } from "./lib/baseUrl";
import { jsonError } from "@lib/apiResponse";
import { checkRateLimit, RATE_LIMITS } from "./lib/rateLimit";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isWriteMethod(method: string): boolean {
  return !READ_METHODS.has(method);
}

function tooManyRequests(message: string, retryAfter: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}

function applyRateLimit(
  context: {
    request: Request;
    redirect: (path: string) => Response;
    locals: { user: { id: number } };
    clientAddress?: string;
  },
  relativePath: string,
): Response | null {
  const { request, redirect, locals, clientAddress } = context;
  const method = request.method.toUpperCase();

  if (relativePath === "/login" && method === "POST") {
    const key = `login:ip:${clientAddress ?? "unknown"}`;
    const result = checkRateLimit(key, RATE_LIMITS.login);
    if (!result.ok) {
      return redirect(
        resolveUrl(`/login?toast_msg=${encodeURIComponent("Demasiados intentos. Probá en unos minutos.")}&toast_type=error`),
      );
    }
    return null;
  }

  if (relativePath.startsWith("/api/")) {
    const isWrite = isWriteMethod(method);
    const identifier = locals.user.id > 0 ? `u:${locals.user.id}` : `ip:${clientAddress ?? "unknown"}`;

    if (isWrite && relativePath === "/api/cronograma/import") {
      const uploadKey = `upload:${identifier}:${relativePath}`;
      const uploadResult = checkRateLimit(uploadKey, RATE_LIMITS.upload);
      if (!uploadResult.ok) {
        return tooManyRequests("Demasiadas importaciones. Probá más tarde.", uploadResult.retryAfter);
      }
    }

    const key = `${isWrite ? "api-write" : "api-read"}:${identifier}:${relativePath}`;
    const profile = isWrite ? RATE_LIMITS.apiWrite : RATE_LIMITS.apiRead;
    const result = checkRateLimit(key, profile);
    if (!result.ok) {
      return tooManyRequests("Demasiadas solicitudes. Probá más tarde.", result.retryAfter);
    }
  }

  return null;
}

function setSecurityHeaders(response: Response): Response {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://wms.ign.gob.ar",
      "font-src 'self'",
      "connect-src 'self' data: https://docs.google.com https://cdn.jsdelivr.net https://api.iconify.design https://api.unisvg.com https://api.simplesvg.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals } = context;
  const path = url.pathname;

  const cleanBase = getCleanBase();

  const getRelativePath = (pathname: string) => {
    if (pathname.startsWith(cleanBase)) {
      return '/' + pathname.slice(cleanBase.length);
    }
    if (pathname === cleanBase.slice(0, -1)) {
      return '/';
    }
    return pathname;
  };

  const relativePath = getRelativePath(path);

  let currentUser = {
    id: 0,
    username: "Usuario",
    role: "agent",
  };

  const signedSessionId = cookies.get("session_id")?.value;
  let sessionId: string | null = null;

  if (signedSessionId) {
    sessionId = verifySessionId(signedSessionId);
  }

  if (sessionId) {
    const [session] = await db
      .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (session && session.expiresAt > Date.now()) {
      const [dbUser] = await db
        .select({ id: users.id, username: users.username, role: users.role })
        .from(users)
        .where(eq(users.id, session.userId));

      if (dbUser) {
        currentUser = dbUser;
      }
    } else {
      deleteSessionCookie(cookies);
      if (session) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
      }
      if (relativePath !== "/login") {
        return redirect(resolveUrl(`/login?toast_msg=${encodeURIComponent("Tu sesión ha expirado")}&toast_type=warning`));
      }
    }
  } else if (signedSessionId) {
    deleteSessionCookie(cookies);
    if (relativePath !== "/login") {
      return redirect(resolveUrl(`/login?toast_msg=${encodeURIComponent("Sesión inválida")}&toast_type=error`));
    }
  }

  locals.user = currentUser;

  const rateLimited = applyRateLimit(context, relativePath);
  if (rateLimited) {
    return rateLimited;
  }

  const lowerPath = relativePath.toLowerCase();

  // Proteger endpoints de API para usuarios no autenticados
  if (
    lowerPath.startsWith("/api/cronograma") ||
    lowerPath.startsWith("/api/disponibilidad") ||
    lowerPath.startsWith("/api/asistencia") ||
    lowerPath.startsWith("/api/calidad") ||
    lowerPath.startsWith("/api/admin") ||
    lowerPath.startsWith("/api/export")
  ) {
    if (currentUser.id === 0) {
      return jsonError("Sesión no iniciada", 401);
    }
  }

  // Redirigir si no está autenticado e intenta acceder a supervisión o admin (insensible a mayúsculas/minúsculas)
  if (
    lowerPath === "/supervision" || lowerPath.startsWith("/supervision/") ||
    lowerPath === "/admin" || lowerPath.startsWith("/admin/")
  ) {
    if (currentUser.id === 0) {
      return redirect(resolveUrl("/login"));
    }
  }

  if (relativePath === "/login") {
    const response = await next();
    return setSecurityHeaders(response);
  }

  const role = (currentUser.role || "").toLowerCase().trim();

  if (!hasPermission(relativePath, role)) {
    if (currentUser.id !== 0) {
      return redirect(resolveUrl(`/?toast_msg=${encodeURIComponent("Acceso no autorizado")}&toast_type=error`));
    }
    return redirect(resolveUrl("/login"));
  }

  const response = await next();
  return setSecurityHeaders(response);
});
