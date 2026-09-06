import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

const HOST = "http://localhost:4321";

test.describe("Admin Permisos y Accesos", () => {
  let adminCookie: string;
  let agentCookie: string;
  let adminUsername: string;
  let agentUsername: string;
  let adminSession: string;
  let agentSession: string;
  let adminId: number;
  let agentId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    adminUsername = `admin_perm_test_${ts}`;
    agentUsername = `agent_perm_test_${ts}`;
    adminSession = `perm-admin-${ts}`;
    agentSession = `perm-agent-${ts}`;

    const [au] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
      .returning({ id: users.id });
    const [gu] = await db
      .insert(users)
      .values({ username: agentUsername, password: "x", role: "agent" })
      .returning({ id: users.id });
    adminId = au.id;
    agentId = gu.id;

    await db.insert(sessions).values({ id: adminSession, userId: adminId, expiresAt: Date.now() + 86400000 });
    await db.insert(sessions).values({ id: agentSession, userId: agentId, expiresAt: Date.now() + 86400000 });
    adminCookie = sign(adminSession);
    agentCookie = sign(agentSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    await db.delete(sessions).where(eq(sessions.id, agentSession));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, agentId));
  });

  test("admin puede acceder a /admin/permisos y ve tabla de mesas", async ({ page, context }) => {
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto(`${HOST}/admin/permisos`);
    await expect(page).not.toHaveURL(`${HOST}/`);
    await expect(page.locator("#global-toast-container")).not.toContainText("Acceso no autorizado");
    await expect(page.locator("#permisos-root")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#permisos-root table")).toBeVisible();
  });

  test("admin con canWrite ve botón de sincronización", async ({ page, context }) => {
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto(`${HOST}/admin/permisos`);
    await expect(page.locator("#mesas-sync")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#permisos-root[data-can-write='1']")).toBeVisible();
  });

  test("agente es redirigido desde /admin/permisos", async ({ page, context }) => {
    await context.addCookies([
      { name: "session_id", value: agentCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto(`${HOST}/admin/permisos`);
    await expect(page).toHaveURL(`${HOST}/`);
    await expect(page.locator("#global-toast-container")).toContainText("Acceso no autorizado");
  });
});
