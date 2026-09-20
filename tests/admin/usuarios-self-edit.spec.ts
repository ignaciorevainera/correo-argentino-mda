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

  test("update-user sobre sí mismo es rechazado y no altera el usuario", async ({
    page,
  }) => {
    // Host-agnostico: deriva dominio y URL del baseURL del proyecto.
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    await page.goto("/admin/usuarios");

    const btn = page.locator(
      `[data-edit-user-btn][data-user-id="${adminId}"]`,
    );
    await btn.click();
    await expect(page.locator(`#modal-edit-user-${adminId}`)).toBeVisible();
    await page.locator(`#edit-user-role-${adminId}`).selectOption("agent");
    // El admin sembrado por DB no tiene fila agents: el input nombre queda
    // vacio y el `required` frenaria el submit. Se completa para que el POST
    // llegue al server y el bloqueo de autoedicion responda el 400.
    await page.locator(`#edit-user-name-${adminId}`).fill("Admin Self");
    // AsyncFormScript bindea también los forms de islas server:defer: el
    // submit es AJAX (Accept: application/json) y el error viaja en el JSON.
    // Los invariantes son: el error se muestra y el rol en DB sigue siendo
    // admin.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/admin/usuarios") && r.request().method() === "POST",
      ),
      page.locator(`#modal-edit-user-${adminId} button[type='submit']`).click(),
    ]);
    expect(response.headers()["content-type"]).toContain("application/json");
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
