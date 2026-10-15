import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index";
import { users, sessions, mesas } from "./db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "./lib/session";
import { hasPermission } from "./lib/rbac";
import { getIslandEffectivePathname } from "./lib/navigation";
import { isSectionVisibleSync, resolveSessionMesa } from "./lib/helpdeskAccess";
import { resolveUrl } from "./lib/url";
import { getCleanBase } from "./lib/baseUrl";
import { jsonError } from "@lib/apiResponse";
import { KB_CATEGORIAS_PATH, isCategoryFormKbPath } from "@lib/kbRedirects";
import { checkRateLimit, RATE_LIMITS } from "./lib/rateLimit";
import {
  isFingerprintValid,
  computeFingerprint,
} from "./lib/sessionFingerprint";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
  const { request, redirect, locals, clientAddress } = context;
  const method = request.method.toUpperCase();

  if (relativePath === "/login" && method === "POST") {
    const key = `login:ip:${clientAddress ?? "unknown"}`;
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
        : `ip:${clientAddress ?? "unknown"}`;

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
        : `ip:${clientAddress ?? "unknown"}`;
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
      "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://wms.ign.gob.ar",
      "font-src 'self'",
      "connect-src 'self' data: https://docs.google.com https://cdn.jsdelivr.net https://api.iconify.design https://api.unisvg.com https://api.simplesvg.com",
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
    const [session] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        fingerprint: sessions.fingerprint,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (session && session.expiresAt > Date.now()) {
      const currentFingerprint = computeFingerprint(
        context.request.headers.get("user-agent"),
      );
      if (!isFingerprintValid(session.fingerprint, currentFingerprint)) {
        deleteSessionCookie(cookies);
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        sessionId = null;
        if (relativePath !== "/login") {
          return redirect(
            resolveUrl(
              `/login?toast_msg=${encodeURIComponent("Sesión inválida")}&toast_type=error`,
            ),
          );
        }
      } else {
        const [dbUser] = await db
          .select({
            id: users.id,
            username: users.username,
            role: users.role,
            helpdeskId: users.helpdeskId,
            helpdeskName: users.helpdeskName,
            active: users.active,
            mesaActive: mesas.active,
            mesaName: mesas.name,
          })
          .from(users)
          .leftJoin(mesas, eq(users.helpdeskId, mesas.invgateId))
          .where(eq(users.id, session.userId));

        if (dbUser && !dbUser.active) {
          // Cuenta desactivada por un admin: se invalida la sesión y se expulsa.
          deleteSessionCookie(cookies);
          await db.delete(sessions).where(eq(sessions.id, sessionId));
          sessionId = null;
          if (relativePath !== "/login") {
            return redirect(
              resolveUrl(
                `/login?toast_msg=${encodeURIComponent("Tu cuenta fue desactivada")}&toast_type=warning`,
              ),
            );
          }
        } else if (dbUser) {
          // Fail-closed: mesa desactivada, borrada o desconocida = usuario
          // tratado como "sin mesa" (solo paginas comunes visibles) hasta que
          // un admin le reasigne una mesa activa. resolveSessionMesa aplica
          // la política; el nombre viene de la mesa real (join), no del
          // campo denormalizado en users.
          const mesa = resolveSessionMesa({
            helpdeskId: dbUser.helpdeskId,
            helpdeskName: dbUser.mesaName ?? null,
            mesaActive: dbUser.mesaActive,
          });
          currentUser = {
            id: dbUser.id,
            username: dbUser.username,
            role: dbUser.role,
            helpdeskId: mesa.helpdeskId,
            helpdeskName: mesa.helpdeskName,
          };
        }
      }
    } else {
      deleteSessionCookie(cookies);
      if (session) {
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

  // Proteger endpoints de API para usuarios no autenticados
  if (
    lowerPath.startsWith("/api/cronograma") ||
    lowerPath.startsWith("/api/disponibilidad") ||
    lowerPath.startsWith("/api/asistencia") ||
    lowerPath.startsWith("/api/calidad") ||
    lowerPath.startsWith("/api/admin") ||
    lowerPath.startsWith("/api/export") ||
    lowerPath.startsWith("/api/profile")
  ) {
    if (currentUser.id === 0) {
      return jsonError("Sesión no iniciada", 401);
    }
  }

  // Redirigir si no está autenticado e intenta acceder a supervisión, admin o automatizaciones (insensible a mayúsculas/minúsculas)
  if (
    lowerPath === "/supervision" ||
    lowerPath.startsWith("/supervision/") ||
    lowerPath === "/admin" ||
    lowerPath.startsWith("/admin/") ||
    lowerPath === "/automatizaciones" ||
    lowerPath.startsWith("/automatizaciones/")
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
      return jsonError("Acceso no autorizado", 401);
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
