// tests/admin/usuarios-self-edit.spec.ts
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

test.describe("Sin autoedición de usuario", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    const adminUsername = `admin_selftest_${ts}`;
    adminSession = `sess_selftest_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
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

  test("change-role sobre sí mismo es rechazado y no altera el usuario", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto("http://localhost:4321/admin/usuarios");

    const btn = page.locator(
      `[data-action="change-role-btn"][data-user-id="${adminId}"]`,
    );
    await btn.click();
    await page.locator("#change-role-select").selectOption("agent");
    // El submit del modal en islas server:defer es nativo (AsyncFormScript no
    // re-bindea islas inyectadas), así que la respuesta es la navegación POST
    // del propio documento. Los invariantes son: el error se muestra y el rol
    // en DB sigue siendo admin. No se aserta el status HTTP (200 con HTML).
    await Promise.all([
      page.waitForLoadState("load"),
      page.locator("#modal-change-role button[type='submit']").click(),
    ]);
    await expect(page.locator("#global-toast-container")).toContainText(
      "No podés editar tu propio usuario",
      { timeout: 10000 },
    );

    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, adminId));
    expect(row.role).toBe("admin");
  });
});
