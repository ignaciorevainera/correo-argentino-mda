import type { APIRoute } from "astro";
import { db } from "@db/index";
import { sessions } from "@db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "@lib/session";
import { getCleanBase } from "@lib/baseUrl";

export const ALL: APIRoute = async ({ cookies, redirect }) => {
  const signedSessionId = cookies.get("session_id")?.value;

  if (signedSessionId) {
    const sessionId = verifySessionId(signedSessionId);
    if (sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
  }
  deleteSessionCookie(cookies);

  const cleanBase = getCleanBase();
  return redirect(`${cleanBase}login?toast_msg=${encodeURIComponent("Sesión cerrada con éxito")}&toast_type=success`);
};
