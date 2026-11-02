import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index";
import { sessions } from "./db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "./lib/session";
import { hasPermission } from "./lib/rbac";
import { getIslandEffectivePathname } from "./lib/navigation";
import { isSectionVisibleSync } from "./lib/helpdeskAccess";
import { resolveUrl } from "./lib/url";
import { getCleanBase } from "./lib/baseUrl";
import { jsonError } from "@lib/apiResponse";
import { KB_CATEGORIAS_PATH, isCategoryFormKbPath } from "@lib/kbRedirects";
import { checkRateLimit, RATE_LIMITS } from "./lib/rateLimit";
import { resolveClientIp } from "@lib/clientIp";
import {
  resolveSessionUser,
  invalidateSessionCache,
} from "./lib/sessionCache";
import { resolveViewAs, VIEW_AS_COOKIE } from "./lib/viewSimulation";
import { assertServerEnv } from "./lib/env";
assertServerEnv();

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Default-deny de sesión (#232): todo /api/**, /_actions/** y
// /_server-islands/** exige sesión salvo la allowlist pública; toda página
// exige sesión salvo /404 (/login ya retornó arriba). Un endpoint nuevo queda
// protegido por defecto.
const PUBLIC_API_PREFIXES = ["/api/icons/"];
// `/generador-firmas` es pública por diseño (sección que debe funcionar sin
// login) y `/404` se sirve sin sesión. Cualquier otra página exige sesión.
const PUBLIC_PAGE_PATHS = new Set(["/404", "/generador-firmas"]);

const KB_WRITE_THROTTLE_MESSAGE =
  "Demasiadas operaciones. Probá en unos minutos.";

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
  const { request, redirect, locals } = context;
  // #235: detrás de Apache el socket es loopback para todos; resolver la IP real
  // (sólo desde loopback) para que el bucket de login sea por usuario/IP y no global.
  const clientAddress = resolveClientIp(
    context.clientAddress,
    request.headers.get("x-forwarded-for"),
  );
  const method = request.method.toUpperCase();

  if (relativePath === "/login" && method === "POST") {
    const key = `login:ip:${clientAddress}`;
    const result = checkRateLimit(key, RATE_LIMITS.login);
    if (!result.ok) {
      return redirect(
        resolveUrl(
          `/login?toast_msg=${encodeURIComponent("Demasiados intentos. Probá en unos minutos.")}&toast_type=error`,
        ),
      );
    }
    return null;
  }

  if (relativePath.startsWith("/api/")) {
    const isWrite = isWriteMethod(method);
    const identifier =
      locals.user.id > 0
        ? `u:${locals.user.id}`
        : `ip:${clientAddress}`;

    if (isWrite && relativePath === "/api/cronograma/import") {
      const uploadKey = `upload:${identifier}:${relativePath}`;
      const uploadResult = checkRateLimit(uploadKey, RATE_LIMITS.upload);
      if (!uploadResult.ok) {
        return tooManyRequests(
          "Demasiadas importaciones. Probá más tarde.",
          uploadResult.retryAfter,
        );
      }
    }

    // Favoritos de títulos: perfil propio y amplio (toggles por-usuario).
    if (isWrite && relativePath === "/api/titulos/favoritos") {
      const result = checkRateLimit(
        `fav-write:${identifier}:${relativePath}`,
        RATE_LIMITS.favoriteWrite,
      );
      if (!result.ok) {
        return tooManyRequests(
          "Demasiadas acciones. Probá en unos segundos.",
          result.retryAfter,
        );
      }
      return null;
    }

    const key = `${isWrite ? "api-write" : "api-read"}:${identifier}:${relativePath}`;
    const profile = isWrite ? RATE_LIMITS.apiWrite : RATE_LIMITS.apiRead;
    const result = checkRateLimit(key, profile);
    if (!result.ok) {
      return tooManyRequests(
        "Demasiadas solicitudes. Probá más tarde.",
        result.retryAfter,
      );
    }
  }

  if (relativePath === KB_CATEGORIAS_PATH && method === "POST") {
    const identifier =
      locals.user.id > 0
        ? `u:${locals.user.id}`
        : `ip:${clientAddress}`;
    const result = checkRateLimit(
      `kb-write:${identifier}:${relativePath}`,
      RATE_LIMITS.kbCategoryWrite,
    );
    if (!result.ok) {
      const message = encodeURIComponent(KB_WRITE_THROTTLE_MESSAGE);
      // Un POST anonimo cae igual en /login por RBAC: mandarlo ahi y no al
      // ABM (que no puede ver) evita dejar el corte a la vista de un
      // visitante que no tiene sesion.
      if (locals.user.id === 0) {
        return redirect(
          resolveUrl(`/login?toast_msg=${message}&toast_type=error`),
        );
      }
      return redirect(
        resolveUrl(
          `${KB_CATEGORIAS_PATH}?toast_msg=${message}&toast_type=error`,
        ),
      );
    }
  }

  if (method === "POST" && isCategoryFormKbPath(relativePath)) {
    const identifier =
      locals.user.id > 0
        ? `u:${locals.user.id}`
        : `ip:${clientAddress ?? "unknown"}`;
    const result = checkRateLimit(
      `kb-article-write:${identifier}`,
      RATE_LIMITS.kbArticleWrite,
    );
    if (!result.ok) {
      const message = encodeURIComponent(KB_WRITE_THROTTLE_MESSAGE);
      if (locals.user.id === 0) {
        return redirect(
          resolveUrl(`/login?toast_msg=${message}&toast_type=error`),
        );
      }
      return redirect(
        resolveUrl(`${relativePath}?toast_msg=${message}&toast_type=error`),
      );
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
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // #241: el CDN de Chart.js fuera de script-src (ya vive bundleado en
      // ChartCard.astro) y de connect-src (nadie lo fetchea).
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://wms.ign.gob.ar",
      "font-src 'self'",
      "connect-src 'self' data: https://docs.google.com https://api.iconify.design https://api.unisvg.com https://api.simplesvg.com",
      "media-src 'self' data: blob: https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals } = context;
  const path = url.pathname;

  const cleanBase = getCleanBase();

  const getRelativePath = (pathname: string) => {
    let relative: string;
    if (pathname.startsWith(cleanBase)) {
      relative = "/" + pathname.slice(cleanBase.length);
    } else if (pathname === cleanBase.slice(0, -1)) {
      relative = "/";
    } else {
      relative = pathname;
    }
    // Astro routea con trailingSlash: "ignore": /x y /x/ ejecutan el mismo
    // handler, pero url.pathname conserva el slash final. Normalizar una sola
    // vez aca evita que un slash final esquive cualquier guard que compare
    // por igualdad exacta (rate limit de /login y del ABM de categorias).
    return relative.length > 1 ? relative.replace(/\/+$/, "") : relative;
  };

  const relativePath = getRelativePath(path);

  let currentUser = {
    id: 0,
    username: "Usuario",
    role: "agent",
    helpdeskId: null as number | null,
    helpdeskName: null as string | null,
  };

  const signedSessionId = cookies.get("session_id")?.value;
  let sessionId: string | null = null;

  if (signedSessionId) {
    sessionId = verifySessionId(signedSessionId);
  }

  if (sessionId) {
    const resolved = await resolveSessionUser(
      sessionId,
      context.request.headers.get("user-agent"),
    );

    if (resolved.status === "ok") {
      currentUser = resolved.user;
    } else if (resolved.status === "invalid_fingerprint") {
      deleteSessionCookie(cookies);
      invalidateSessionCache(sessionId);
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      sessionId = null;
      if (relativePath !== "/login") {
        return redirect(
          resolveUrl(
            `/login?toast_msg=${encodeURIComponent("Sesión inválida")}&toast_type=error`,
          ),
        );
      }
    } else if (resolved.status === "user_inactive") {
      deleteSessionCookie(cookies);
      invalidateSessionCache(sessionId);
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      sessionId = null;
      if (relativePath !== "/login") {
        return redirect(
          resolveUrl(
            `/login?toast_msg=${encodeURIComponent("Tu cuenta fue desactivada")}&toast_type=warning`,
          ),
        );
      }
    } else {
      deleteSessionCookie(cookies);
      invalidateSessionCache(sessionId);
      if (resolved.hadRow) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
      }
      if (relativePath !== "/login") {
        return redirect(
          resolveUrl(
            `/login?toast_msg=${encodeURIComponent("Tu sesión ha expirado")}&toast_type=warning`,
          ),
        );
      }
    }
  } else if (signedSessionId) {
    deleteSessionCookie(cookies);
    if (relativePath !== "/login") {
      return redirect(
        resolveUrl(
          `/login?toast_msg=${encodeURIComponent("Sesión inválida")}&toast_type=error`,
        ),
      );
    }
  }

  locals.user = currentUser;
  locals.sessionId = sessionId;
  // Simulación de vista: sólo se aplica si el rol real es admin (fail-closed).
  locals.viewAs = resolveViewAs(
    currentUser.role,
    cookies.get(VIEW_AS_COOKIE)?.value,
  );

  const rateLimited = applyRateLimit(context, relativePath);
  if (rateLimited) {
    return rateLimited;
  }

  const lowerPath = relativePath.toLowerCase();

  // Server islands: heredar permisos de la pagina padre (header Referer).
  // Sin referer valido queda el path de la island -> deny-by-default.
  const checkPath = getIslandEffectivePathname(
    relativePath,
    context.request.headers.get("referer"),
  );

  if (relativePath === "/login") {
    const response = await next();
    return setSecurityHeaders(response);
  }

  // Default-deny de sesión (#232). Los endpoints (`/api/**`, `/_actions/**`,
  // `/_server-islands/**`) exigen sesión salvo la allowlist pública; toda
  // página exige sesión salvo /404 (/login ya retornó arriba). Un endpoint
  // nuevo queda protegido por defecto.
  if (currentUser.id === 0) {
    const isApiLike =
      lowerPath.startsWith("/api/") ||
      lowerPath.startsWith("/_actions/") ||
      lowerPath.startsWith("/_server-islands/");
    if (isApiLike) {
      const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) =>
        lowerPath.startsWith(prefix),
      );
      if (!isPublicApi) {
        return jsonError("Sesión no iniciada", 401, "no-store");
      }
    } else if (!PUBLIC_PAGE_PATHS.has(relativePath)) {
      // Páginas: match exacto case-sensitive contra `relativePath` (Astro
      // routea case-sensitive); los endpoints usan `lowerPath` normalizado.
      return redirect(resolveUrl("/login"));
    }
  }

  const role = (currentUser.role || "").toLowerCase().trim();

  const allowed = hasPermission(checkPath, role);
  if (!allowed) {
    if (currentUser.id !== 0) {
      return redirect(
        resolveUrl(
          `/?toast_msg=${encodeURIComponent("Acceso no autorizado")}&toast_type=error`,
        ),
      );
    }
    return redirect(resolveUrl("/login"));
  }

  const sectionVisible = isSectionVisibleSync(
    currentUser.helpdeskName,
    role,
    checkPath,
  );
  if (!sectionVisible) {
    if (relativePath.startsWith("/api/")) {
      return jsonError("Acceso no autorizado", 401, "no-store");
    }
    if (currentUser.id !== 0) {
      return redirect(
        resolveUrl(
          `/?toast_msg=${encodeURIComponent("Acceso no autorizado")}&toast_type=error`,
        ),
      );
    }
    return redirect(resolveUrl("/login"));
  }

  const response = await next();
  return setSecurityHeaders(response);
});
