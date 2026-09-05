// tests/admin/usuarios-change-role.spec.ts
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

test.describe("Cambiar rol y mesa: el rol se preserva", () => {
  let adminCookie: string;
  let adminUsername: string;
  let adminSession: string;
  let adminId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    adminUsername = `admin_roltest_${ts}`;
    adminSession = `sess_roltest_${ts}`;
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

  test("abrir modal change-role sobre un admin preserva el rol 'admin' al cambiar mesa", async ({ page, context }) => {
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto("http://localhost:4321/admin/usuarios");

    const btn = page.locator(`[data-action="change-role-btn"][data-user-id="${adminId}"]`);
    await btn.click();

    const roleSelect = page.locator("#change-role-select");
    await expect(roleSelect).toHaveValue("admin");

    // Cambiar la mesa a "Sin mesa de ayuda" no debe degradar el rol
    const helpdeskSelect = page.locator("#change-role-helpdesk-select");
    await helpdeskSelect.selectOption("");
    await expect(roleSelect).toHaveValue("admin");

    // Las opciones de rol incluyen admin siempre (5 opciones)
    const options = await roleSelect.locator("option").allTextContents();
    expect(options).toEqual(["Agente", "Referente", "Team Leader", "Supervisor", "Administrador"]);
  });
});
