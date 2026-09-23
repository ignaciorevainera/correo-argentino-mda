// tests/admin/usuarios-deactivate.spec.ts
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

test.describe("Baja de usuarios (soft-delete)", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    adminSession = `sess_deact_admin_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_deact_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({
      id: adminSession,
      userId: adminId,
      expiresAt: Date.now() + 86400000,
    });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    await db.delete(users).where(eq(users.id, adminId));
  });

  test("no puede desactivarse a sí mismo", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: { action: "deactivate-user", userId: String(adminId) },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("No podés desactivar tu propio usuario");

    const [row] = await db
      .select({ active: users.active })
      .from(users)
      .where(eq(users.id, adminId));
    expect(row.active).toBe(true);
  });

  test("reactiva un usuario desactivado", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const ts = Date.now();
    const [target] = await db
      .insert(users)
      .values({ username: `deact_target_${ts}`, password: "x", role: "agent", active: false, disabledAt: new Date() })
      .returning({ id: users.id });

    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: { action: "reactivate-user", userId: String(target.id) },
    });
    expect(response.status()).toBe(200);

    const [row] = await db
      .select({ active: users.active, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, target.id));
    expect(row.active).toBe(true);
    expect(row.disabledAt).toBeNull();

    await db.delete(users).where(eq(users.id, target.id));
  });

  test("un usuario inactivo es expulsado en su próximo request", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const ts = Date.now();
    const sessionId = `sess_inactive_${ts}`;
    const [inactive] = await db
      .insert(users)
      .values({ username: `inactive_${ts}`, password: "x", role: "agent", active: false })
      .returning({ id: users.id });

    try {
      await db.insert(sessions).values({
        id: sessionId,
        userId: inactive.id,
        expiresAt: Date.now() + 86400000,
      });

      await page.context().addCookies([
        {
          name: "session_id",
          value: sign(sessionId),
          domain: new URL(baseURL).hostname,
          path: "/",
        },
      ]);
      await page.goto("/");

      await expect(page).toHaveURL(/\/login/);

      const cookies = await page.context().cookies();
      expect(cookies.some((c) => c.name === "session_id")).toBe(false);

      const remaining = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, sessionId));
      expect(remaining).toHaveLength(0);

      await expect(page.getByText("Tu cuenta fue desactivada")).toBeVisible();
    } finally {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      await db.delete(users).where(eq(users.id, inactive.id));
    }
  });

  test("login de usuario inactivo es rechazado", async ({ page }) => {
    const ts = Date.now();
    const username = `inactive_login_${ts}`;
    const password = "Test1234!";
    const bcrypt = await import("bcryptjs");
    const [u] = await db
      .insert(users)
      .values({
        username,
        password: await bcrypt.hash(password, 10),
        role: "agent",
        active: false,
      })
      .returning({ id: users.id });

    // Aísla la capa de login: el POST en sí no debe emitir cookie de sesión ni
    // redirigir al home. Sin esto el test pasa igual porque el middleware
    // expulsa al inactivo en el request siguiente (falso positivo).
    const res = await page.request.post("/login", {
      form: { username, password },
      maxRedirects: 0,
    });
    expect(res.headers()["location"] ?? "").toMatch(/\/login/);
    expect(res.headers()["set-cookie"] ?? "").not.toContain("session_id");

    await page.goto("/login");
    await page.fill("#login-username", username);
    await page.fill("#login-password", password);
    await page.click("button[type=submit]");
    // El login válido redirige a cleanBase; el inactivo debe quedar en /login
    // con el toast de cuenta desactivada.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Tu cuenta fue desactivada")).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "session_id")).toBeUndefined();

    await db.delete(users).where(eq(users.id, u.id));
  });
});
