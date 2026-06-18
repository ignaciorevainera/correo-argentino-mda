import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index";
import { users, sessions } from "./db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "./lib/session";
import { hasPermission } from "./lib/rbac";

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals } = context;
  const path = url.pathname;

  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith('/') ? base : base + '/';

  const getRelativePath = (pathname: string) => {
    if (pathname.startsWith(cleanBase)) {
      return '/' + pathname.slice(cleanBase.length);
    }
    if (pathname === cleanBase.slice(0, -1)) {
      return '/';
    }
    return pathname;
  };

  const resolveUrl = (pathStr: string) => {
    const cleanPath = pathStr.startsWith('/') ? pathStr.slice(1) : pathStr;
    return `${cleanBase}${cleanPath}`;
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
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (session && session.expiresAt > Date.now()) {
      const [dbUser] = await db
        .select()
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

  // Redirigir si no está autenticado e intenta acceder a supervisión o admin
  if (
    relativePath === "/supervision" || relativePath.startsWith("/supervision/") ||
    relativePath === "/admin" || relativePath.startsWith("/admin/")
  ) {
    if (currentUser.id === 0) {
      return redirect(resolveUrl("/login"));
    }
  }

  if (relativePath === "/login") {
    return next();
  }

  const role = (currentUser.role || "").toLowerCase().trim();

  if (!hasPermission(relativePath, role)) {
    if (currentUser.id !== 0) {
      return redirect(resolveUrl(`/?toast_msg=${encodeURIComponent("Acceso no autorizado")}&toast_type=error`));
    }
    return redirect(resolveUrl("/login"));
  }

  return next();
});
