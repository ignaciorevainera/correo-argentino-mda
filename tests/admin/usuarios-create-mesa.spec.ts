// tests/admin/usuarios-create-mesa.spec.ts
// NOTE: AsyncFormScript renders errors via showToast() into #global-toast-container,
// not into body text — assertion targets the toast (invariants kept: no user row
// created + error mentioning "mesa de ayuda es obligatoria").
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

test.describe("Alta de usuario requiere mesa de ayuda", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    const adminUsername = `admin_mesatest_${ts}`;
    adminSession = `sess_mesatest_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({ id: adminSession, userId: adminId, expiresAt: Date.now() + 86400000 });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    await db.delete(users).where(eq(users.id, adminId));
  });

  test("POST create sin mesa muestra error y no crea el usuario", async ({ page }) => {
    await page.context().addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto("http://localhost:4321/admin/usuarios");
    await page.click("#btn-nuevo-usuario");
    await expect(page.locator("#modal-create-user")).toBeVisible();

    const form = page.locator("#modal-create-user form");
    const uname = `sinmesa_${Date.now()}`;
    await form.locator("input[name='name']").fill("Test Sin Mesa");
    await form.locator("input[name='username']").fill(uname);
    await form.locator("input[name='password']").fill("Password.123");
    // PasswordField renderiza input de repetición requerido (sin name).
    await form.locator("#admin-password-repeat").fill("Password.123");
    // No tocar el select de mesa (queda en el placeholder vacío).
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/admin/usuarios") && r.request().method() === "POST",
      ),
      form.locator("button[type='submit']").first().click(),
    ]);
    // AsyncFormScript bindea también los forms de islas server:defer: el
    // submit es AJAX (Accept: application/json) y el error viaja en el JSON,
    // que AsyncFormScript muestra vía showToast sin recargar la página.
    expect(response.headers()["content-type"]).toContain("application/json");
    await expect(page.locator("#global-toast-container")).toContainText(
      "mesa de ayuda es obligatoria",
      { timeout: 10000 },
    );
    const orphan = await db.select({ id: users.id }).from(users).where(eq(users.username, uname));
    expect(orphan.length).toBe(0);
  });
});
