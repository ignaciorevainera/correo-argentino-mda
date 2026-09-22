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

  test("UI deshabilita los botones de la fila propia", async ({ page }) => {
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

    const editBtn = page.locator(
      `[data-edit-user-btn][data-user-id="${adminId}"]`,
    );
    await expect(editBtn).toBeDisabled();
    await expect(editBtn).toHaveClass(/btn-disabled/);
    // Las filas de otros usuarios siguen editables (no es una tabla vacía).
    await expect(
      page.locator("[data-edit-user-btn]:not([disabled])").first(),
    ).toBeAttached();

    // El modal propio no se abre: el click nativo en un <button> disabled no
    // dispara el onclick.
    await editBtn.click({ force: true });
    await expect(
      page.locator(`#modal-edit-user-${adminId}`),
    ).not.toBeVisible();
  });

  test("update-user sobre sí mismo es rechazado y no altera el usuario", async ({
    page,
  }) => {
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

    // El botón de la UI ya está deshabilitado, así que el contrato server se
    // cubre con el POST directo (Accept: application/json = misma vía AJAX
    // que usa AsyncFormScript).
    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: {
        action: "update-user",
        userId: String(adminId),
        role: "agent",
        username: `admin_selftest_${adminId}`,
        name: "Admin Self",
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("No podés editar tu propio usuario");

    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, adminId));
    expect(row.role).toBe("admin");
  });
});
