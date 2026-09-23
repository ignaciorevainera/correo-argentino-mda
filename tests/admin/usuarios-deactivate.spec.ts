// tests/admin/usuarios-deactivate.spec.ts
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, agents } from "../../src/db/schema";
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

  test("flujo UI: desactivar oculta de activos y muestra en inactivos", async ({ page }) => {
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
    const username = `ui_deact_${ts}`;
    const [target] = await db
      .insert(users)
      .values({ username, password: "x", role: "agent" })
      .returning({ id: users.id });

    try {
      await page.goto("/admin/usuarios");
      await page.click(`#deactivate-user-${target.id}`);
      await page
        .locator(`#modal-deactivate-${target.id} button[type=submit]`)
        .click();
      await page.waitForLoadState("networkidle");

      await expect(page.locator(`#deactivate-user-${target.id}`)).toHaveCount(0);
      await expect(
        page.locator("[data-inactive-user-row]", { hasText: username }),
      ).toHaveCount(1);

      const [row] = await db
        .select({ active: users.active })
        .from(users)
        .where(eq(users.id, target.id));
      expect(row.active).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, target.id));
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

    try {
      // Aísla la capa de login: el POST en sí no debe emitir cookie de sesión ni
      // redirigir al home. Un flujo de browser no discrimina porque el middleware
      // (Task 5) re-expulsa al inactivo y muestra el mismo toast.
      const res = await page.request.post("/login", {
        form: { username, password },
        maxRedirects: 0,
      });
      const location = res.headers()["location"] ?? "";
      expect(location).toMatch(/\/login/);
      expect(location).toContain("toast_type=warning");
      expect(location).toContain(
        encodeURIComponent("Tu cuenta fue desactivada"),
      );
      expect(res.headers()["set-cookie"] ?? "").not.toContain("session_id");
    } finally {
      await db.delete(sessions).where(eq(sessions.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  });

  test("un agente de usuario inactivo no aparece en el selector de calidad", async ({ page }) => {
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
    const uname = `cal_inactive_${ts}`;
    let inactiveUserId: number | undefined;
    let inactiveAgentId: number | undefined;
    let activeAgentId: number | undefined;

    try {
      const [u] = await db
        .insert(users)
        .values({ username: uname, password: "x", role: "agent", active: false })
        .returning({ id: users.id });
      inactiveUserId = u.id;
      const [a] = await db
        .insert(agents)
        .values({
          name: `inactive-${ts}`,
          username: uname,
          userId: u.id,
          incluidoCalidad: true,
        })
        .returning({ id: agents.id });
      inactiveAgentId = a.id;

      const [activeAgent] = await db
        .insert(agents)
        .values({
          name: `active-${ts}`,
          incluidoCalidad: true,
        })
        .returning({ id: agents.id });
      activeAgentId = activeAgent.id;

      await page.goto("/supervision/calidad-operadores");

      // Positive control: espera a que el server island renderice la lista real.
      await expect(page.getByText(`active-${ts}`, { exact: true })).toBeVisible();
      await expect(page.locator(`text=inactive-${ts}`)).toHaveCount(0);
    } finally {
      if (inactiveAgentId !== undefined)
        await db.delete(agents).where(eq(agents.id, inactiveAgentId));
      if (activeAgentId !== undefined)
        await db.delete(agents).where(eq(agents.id, activeAgentId));
      if (inactiveUserId !== undefined)
        await db.delete(users).where(eq(users.id, inactiveUserId));
    }
  });

  test("un no-admin no puede desactivar usuarios", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const ts = Date.now();
    const agentSession = `sess_no_admin_${ts}`;
    let agentId: number | undefined;

    try {
      const [agent] = await db
        .insert(users)
        .values({ username: `agent_no_admin_${ts}`, password: "x", role: "agent" })
        .returning({ id: users.id });
      agentId = agent.id;
      await db.insert(sessions).values({
        id: agentSession,
        userId: agentId,
        expiresAt: Date.now() + 86400000,
      });

      await page.context().addCookies([
        {
          name: "session_id",
          value: sign(agentSession),
          domain: new URL(baseURL).hostname,
          path: "/",
        },
      ]);

      const response = await page.request.post("/admin/usuarios", {
        maxRedirects: 0,
        headers: { Accept: "application/json" },
        form: { action: "deactivate-user", userId: String(adminId) },
      });

      // El RBAC del middleware expulsa al no-admin con un 302 a "/" antes de
      // llegar al handler; se toleran 401/403 por si el orden cambia.
      expect([302, 401, 403]).toContain(response.status());

      const [row] = await db
        .select({ active: users.active })
        .from(users)
        .where(eq(users.id, adminId));
      expect(row.active).toBe(true);
    } finally {
      await db.delete(sessions).where(eq(sessions.id, agentSession));
      if (agentId !== undefined)
        await db.delete(users).where(eq(users.id, agentId));
    }
  });

  test("un admin puede desactivar a otro admin cuando hay más de uno activo", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const ts = Date.now();
    const otherAdminSession = `sess_other_admin_${ts}`;
    let otherAdminId: number | undefined;

    try {
      const [otherAdmin] = await db
        .insert(users)
        .values({
          username: `otherAdmin_${ts}`,
          password: "x",
          role: "admin",
          active: true,
        })
        .returning({ id: users.id });
      otherAdminId = otherAdmin.id;
      await db.insert(sessions).values({
        id: otherAdminSession,
        userId: otherAdminId,
        expiresAt: Date.now() + 86400000,
      });

      await page.context().addCookies([
        {
          name: "session_id",
          value: sign(otherAdminSession),
          domain: new URL(baseURL).hostname,
          path: "/",
        },
      ]);

      const response = await page.request.post("/admin/usuarios", {
        headers: { Accept: "application/json" },
        form: { action: "deactivate-user", userId: String(adminId) },
      });
      expect(response.status()).toBe(200);

      const [row] = await db
        .select({ active: users.active })
        .from(users)
        .where(eq(users.id, adminId));
      expect(row.active).toBe(false);
    } finally {
      // adminId lo usan beforeAll/otros tests: reactivar SIEMPRE.
      await db
        .update(users)
        .set({ active: true, disabledAt: null, disabledBy: null })
        .where(eq(users.id, adminId));
      await db.delete(sessions).where(eq(sessions.id, otherAdminSession));
      if (otherAdminId !== undefined)
        await db.delete(users).where(eq(users.id, otherAdminId));
    }
  });
});
