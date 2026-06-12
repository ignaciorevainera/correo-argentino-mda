import type { APIRoute } from "astro";
import { db } from "@db/index";
import { sessions } from "@db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "../lib/session";

export const ALL: APIRoute = async ({ cookies, redirect }) => {
  const signedSessionId = cookies.get("session_id")?.value;

  if (signedSessionId) {
    const sessionId = verifySessionId(signedSessionId);
    if (sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
  }
  deleteSessionCookie(cookies);

  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith('/') ? base : base + '/';
  return redirect(`${cleanBase}login`);
};
