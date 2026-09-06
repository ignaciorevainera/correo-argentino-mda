// tests/admin/base-conocimiento.spec.ts
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

test.describe("Sección Base de conocimiento", () => {
  let adminSession: string;
  let adminCookie: string;
  let adminId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    adminSession = `sess_bk_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_bk_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db
      .insert(sessions)
      .values({ id: adminSession, userId: adminId, expiresAt: Date.now() + 86400000 });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    await db.delete(users).where(eq(users.id, adminId));
  });

  test("página 200 con sidebar y empty-state por mesa", async ({ page }) => {
    await page.context().addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto("http://localhost:4321/base-conocimiento");

    await expect(page).toHaveTitle(/Base de conocimiento/);
    // Sidebar: sección propia + link
    await expect(
      page
        .locator("nav a[href='/base-conocimiento'], aside a[href='/base-conocimiento']")
        .first(),
    ).toBeVisible();
    // Empty-state con mesa del usuario (sin mesa → fallback)
    await expect(page.locator("#base-conocimiento-root")).toContainText(
      "Contenido para Sin mesa de ayuda",
    );
  });
});
