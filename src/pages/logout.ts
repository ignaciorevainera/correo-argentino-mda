import type { APIRoute } from "astro";
import { db } from "@db/index";
import { sessions } from "@db/schema";
import { eq } from "drizzle-orm";

export const ALL: APIRoute = async ({ cookies, redirect }) => {
  const sessionId = cookies.get("session_id")?.value;

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    cookies.delete("session_id", { path: "/" });
  }

  return redirect("/login");
};
