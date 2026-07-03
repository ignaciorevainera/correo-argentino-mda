import type { APIRoute } from "astro";
import { db } from "@db/index";
import { sessions } from "@db/schema";
import { eq } from "drizzle-orm";
import { verifySessionId, deleteSessionCookie } from "@lib/session";
import { redirectWithToast } from "@lib/api/redirectWithToast";

export const ALL: APIRoute = async ({ cookies }) => {
  const signedSessionId = cookies.get("session_id")?.value;

  if (signedSessionId) {
    const sessionId = verifySessionId(signedSessionId);
    if (sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
  }
  deleteSessionCookie(cookies);

  return redirectWithToast("/login", "Sesión cerrada con éxito");
};
