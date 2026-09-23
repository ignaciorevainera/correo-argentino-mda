import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, agents, mesas } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { createHmac, randomUUID } from "crypto";
import { setSessionCookie } from "../helpers/auth";

const MDA_TI_MESA = "TI_GSM_MDA TI";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

interface AdminTestContext {
  adminUsername: string;
  adminSessionId: string;
  adminUserId: number;
}

async function setupAdmin(context: BrowserContext): Promise<AdminTestContext> {
  const suffix = randomUUID();
  const adminUsername = `e2e_part_admin_${suffix}`;
  const adminSessionId = `e2e_part_session_${suffix}`;

  const [newUser] = await db
    .insert(users)
    .values({
      username: adminUsername,
      password: "hashed_fake_password",
      role: "admin",
      helpdeskName: "TI_GSM_MDA TI",
    })
    .returning({ id: users.id });

  await db.insert(sessions).values({
    id: adminSessionId,
    userId: newUser.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  await setSessionCookie(context, signSessionId(adminSessionId));

  return { adminUsername, adminSessionId, adminUserId: newUser.id };
}

async function cleanupAdmin(ctx: AdminTestContext): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, ctx.adminSessionId));
  await db.delete(users).where(eq(users.id, ctx.adminUserId));
}

const uniq = () =>
  `e2e_part_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function waitForUserInDb(username: string, maxRetries = 10): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.username, username));
    if (row && row.count > 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

test.describe("Participaciones de usuarios", () => {
  let adminCtx: AdminTestContext;

  test.beforeAll(async () => {
    const [existing] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI_MESA));
    if (!existing) {
      await db
        .insert(mesas)
        .values({
          invgateId: 910001,
          name: MDA_TI_MESA,
          displayName: null,
          active: true,
          assignable: true,
          lastSyncedAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
    }
  });

  test.beforeEach(async ({ context }) => {
    adminCtx = await setupAdmin(context);
  });

  test.afterEach(async () => {
    await cleanupAdmin(adminCtx);
  });

  test("alta con rol team_leader prefilá crono+cubic", async ({ page }) => {
    const username = uniq();

    await page.goto("/admin/usuarios");
    await page.click("#btn-nuevo-usuario");
    await page.waitForSelector("#nuevo-usuario-form");

    await page.fill("#admin-username", username);
    await page.fill("#admin-password", "CambiarEst0!Clave");
    await page.fill("#admin-fullname", `E2E Participaciones ${username}`);
    await page.selectOption("#admin-role", "team_leader");
    await page.selectOption("#admin-helpdesk", { label: MDA_TI_MESA });

    await expect(
      page.locator('#nuevo-usuario-form input[name="enCronograma"]'),
    ).toBeChecked();
    await expect(
      page.locator('#nuevo-usuario-form input[name="asignableCubic"]'),
    ).toBeChecked();
    await expect(
      page.locator('#nuevo-usuario-form input[name="incluidoCalidad"]'),
    ).not.toBeChecked();
    await expect(
      page.locator('#nuevo-usuario-form input[name="asignableAgs"]'),
    ).not.toBeChecked();

    const submitPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/admin/usuarios") &&
        r.request().method() === "POST",
      { timeout: 15000 },
    ).catch(() => null);

    await page.evaluate(() => {
      const form = document.getElementById("nuevo-usuario-form");
      if (form) HTMLFormElement.prototype.submit.call(form);
    });

    const response = await submitPromise;
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    await page.waitForLoadState("networkidle");

    const created = await waitForUserInDb(username);
    expect(created).toBe(true);

    const [createdUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    expect(createdUser).toBeTruthy();

    const [agentRow] = await db
      .select()
      .from(agents)
      .where(eq(agents.userId, createdUser.id));

    expect(agentRow).toBeTruthy();
    expect(agentRow!.enCronograma).toBe(true);
    expect(agentRow!.asignableCubic).toBe(true);
    expect(agentRow!.incluidoCalidad).toBe(false);
    expect(agentRow!.asignableAgs).toBe(false);

    await db.delete(agents).where(eq(agents.userId, createdUser.id));
    await db.delete(users).where(eq(users.id, createdUser.id));
  });

  test("toggle OFF de enCronograma saca al agente del listado", async ({
    page,
  }) => {
    const username = uniq();

    await page.goto("/admin/usuarios");
    await page.click("#btn-nuevo-usuario");
    await page.waitForSelector("#nuevo-usuario-form");

    await page.fill("#admin-username", username);
    await page.fill("#admin-password", "CambiarEst0!Clave");
    await page.fill("#admin-fullname", `Toggle Crono Test ${username}`);
    await page.selectOption("#admin-helpdesk", { label: MDA_TI_MESA });

    const createSubmitPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/admin/usuarios") &&
        r.request().method() === "POST",
      { timeout: 15000 },
    ).catch(() => null);

    await page.evaluate(() => {
      const form = document.getElementById("nuevo-usuario-form");
      if (form) HTMLFormElement.prototype.submit.call(form);
    });

    const createResponse = await createSubmitPromise;
    expect(createResponse).not.toBeNull();
    expect(createResponse!.status()).toBe(200);

    await page.waitForLoadState("networkidle");

    const created = await waitForUserInDb(username);
    expect(created).toBe(true);

    const res1 = await page.request.get("/api/cronograma/");
    const body1 = await res1.json();
    expect(body1.operators.some((o: any) => o.username === username)).toBe(true);

    const row = page.locator(`article[data-sort-username="${username}"]`);
    await row.waitFor({ state: "visible", timeout: 10000 });
    await row.locator('button[aria-label^="Editar usuario"]').click();

    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();

    await dialog.locator('input[name="enCronograma"]').uncheck();

    await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      const form = dialog?.querySelector("form");
      if (form) form.requestSubmit();
    });
    await page.waitForLoadState("networkidle");

    await new Promise((r) => setTimeout(r, 500));

    const res2 = await page.request.get("/api/cronograma/");
    const body2 = await res2.json();
    expect(body2.operators.some((o: any) => o.username === username)).toBe(
      false,
    );

    const [createdUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    expect(createdUser).toBeTruthy();

    const [agentRow] = await db
      .select()
      .from(agents)
      .where(eq(agents.userId, createdUser.id));
    expect(agentRow).toBeTruthy();

    await db.delete(agents).where(eq(agents.userId, createdUser.id));
    await db.delete(users).where(eq(users.id, createdUser.id));
  });
});
