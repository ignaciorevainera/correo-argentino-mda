import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index";
import { users, sessions } from "./db/schema";
import { eq } from "drizzle-orm";

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

  const sessionId = cookies.get("session_id")?.value;

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
      cookies.delete("session_id", { path: "/" });
      if (session) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
      }
      if (relativePath !== "/login") {
        return redirect(resolveUrl("/login"));
      }
    }
  }

  locals.user = currentUser;

  if (relativePath === "/login") {
    return next();
  }

  const role = (currentUser.role || "").toLowerCase().trim();

  if (relativePath.startsWith("/design-system") && role !== "admin") {
    return redirect(resolveUrl("/login"));
  }

  if (relativePath.startsWith("/admin")) {
    if (relativePath.startsWith("/admin/users")) {
      if (role !== "admin") {
        return redirect(resolveUrl("/login"));
      }
    } else {
      if (!["admin", "supervisor"].includes(role)) {
        return redirect(resolveUrl("/login"));
      }
    }
  }

  if (relativePath.startsWith("/supervision")) {
    if (relativePath.startsWith("/supervision/cronograma")) {
      if (!["supervisor", "admin"].includes(role)) {
        return redirect(resolveUrl("/login"));
      }
    } else {
      if (!["referent", "referente", "supervisor", "admin"].includes(role)) {
        return redirect(resolveUrl("/login"));
      }
    }
  }

  return next();
});
