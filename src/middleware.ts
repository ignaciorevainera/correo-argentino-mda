import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals } = context;
  const path = url.pathname;

  let currentUser = {
    id: 0,
    username: "Usuario",
    role: "agent",
  };

  const sessionUsername = cookies.get("mda_session")?.value;

  if (sessionUsername) {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, sessionUsername));

    if (dbUser) {
      currentUser = dbUser;
    } else {
      cookies.delete("mda_session");
    }
  }

  locals.user = currentUser;

  if (path === "/login") {
    return next();
  }

  const role = currentUser.role;

  if (
    (path.startsWith("/admin") || path.startsWith("/design-system")) &&
    role !== "admin"
  ) {
    return redirect("/login");
  }

  if (path.startsWith("/supervision")) {
    if (path.startsWith("/supervision/asignacion-autogestiones")) {
      if (!["referent", "supervisor", "admin"].includes(role)) {
        return redirect("/login");
      }
    } else {
      if (!["supervisor", "admin"].includes(role)) {
        return redirect("/login");
      }
    }
  }

  return next();
});
