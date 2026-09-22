// tests/admin/usuarios-create-modal.spec.ts
// TDD target: alta de usuario en modal (#btn-nuevo-usuario → #modal-create-user).
// NOTE: AsyncFormScript renders errors via showToast() into #global-toast-container
// (not body text); success redirects via window.location.href after ~500ms, so
// always wait for networkidle before asserting rows.
import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, agents, sessions } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

const MDA_TI_MESA = "TI_GSM_MDA TI";
const VALID_PASSWORD = "CambiarEst0!Clave";

interface AdminTestContext {
  adminUsername: string;
  adminSessionId: string;
  adminUserId: number;
}

async function setupAdmin(page: Page): Promise<AdminTestContext> {
  const ts = Date.now();
  const adminUsername = `admin_createmodal_${ts}`;
  const adminSessionId = `sess_createmodal_${ts}`;
  const [u] = await db
    .insert(users)
    .values({ username: adminUsername, password: "x", role: "admin" })
    .returning({ id: users.id });
  await db.insert(sessions).values({
    id: adminSessionId,
    userId: u.id,
    expiresAt: Date.now() + 86400000,
  });
  await page.context().addCookies([
    { name: "session_id", value: sign(adminSessionId), domain: "localhost", path: "/" },
  ]);
  return { adminUsername, adminSessionId, adminUserId: u.id };
}

async function cleanupAdmin(ctx: AdminTestContext): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, ctx.adminSessionId));
  await db.delete(users).where(eq(users.id, ctx.adminUserId));
}

async function cleanupUser(username: string): Promise<void> {
  await db
    .delete(agents)
    .where(sql`lower(coalesce(${agents.username}, '')) = ${username.toLowerCase()}`);
  await db.delete(users).where(eq(users.username, username));
}

const uniq = () =>
  `e2e_createmodal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

test.describe("Modal de alta de usuario", () => {
  let ctx: AdminTestContext;
  const createdUsernames: string[] = [];

  test.beforeEach(async ({ page }) => {
    ctx = await setupAdmin(page);
    createdUsernames.length = 0;
  });

  test.afterEach(async () => {
    for (const uname of createdUsernames) {
      await cleanupUser(uname);
    }
    await cleanupAdmin(ctx);
  });

  test("abre el modal y muestra el formulario de alta", async ({ page }) => {
    await page.goto("/admin/usuarios");
    await page.locator("#btn-nuevo-usuario").click();

    const modal = page.locator("#modal-create-user");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#admin-username")).toBeVisible();
    await expect(modal.locator("#admin-password")).toBeVisible();
    await expect(modal.locator("#admin-fullname")).toBeVisible();
    await expect(modal.locator("#admin-role")).toBeVisible();
    await expect(modal.locator("#admin-helpdesk")).toBeVisible();
    await expect(modal.locator('button[type="submit"]')).toBeVisible();
  });

  test("mobile 375px: formulario usable y submiteable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/admin/usuarios");
    await page.locator("#btn-nuevo-usuario").click();

    const modal = page.locator("#modal-create-user");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#admin-username")).toBeVisible();
    await expect(modal.locator("#admin-helpdesk")).toBeVisible();

    const box = await modal.boundingBox();
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(375);

    const submit = modal.locator(
      '#nuevo-usuario-form button[type="submit"]',
    );
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
  });

  test("sin mesa: toast de error, modal sigue abierto y no crea usuario", async ({
    page,
  }) => {
    const uname = uniq();
    createdUsernames.push(uname);

    await page.goto("/admin/usuarios");
    await page.locator("#btn-nuevo-usuario").click();

    const modal = page.locator("#modal-create-user");
    await expect(modal).toBeVisible();

    await modal.locator("#admin-username").fill(uname);
    await modal.locator("#admin-password").fill(VALID_PASSWORD);
    await modal.locator("#admin-password-repeat").fill(VALID_PASSWORD);
    await modal.locator("#admin-fullname").fill(`Test Sin Mesa ${uname}`);
    // No tocar el select de mesa (queda en el placeholder vacío).

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
        { timeout: 15000 },
      ),
      modal.locator('button[type="submit"]').first().click(),
    ]);
    expect(response.headers()["content-type"]).toContain("application/json");

    await expect(page.locator("#global-toast-container")).toContainText(
      "mesa de ayuda es obligatoria",
      { timeout: 10000 },
    );
    await expect(modal).toBeVisible();

    const orphan = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, uname));
    expect(orphan.length).toBe(0);

    await modal.getByRole("button", { name: /cancelar/i }).click();
    await expect(modal).toBeHidden();

    await page.locator("#btn-nuevo-usuario").click();
    await expect(page.locator("#modal-create-user #admin-username")).toHaveValue(
      "",
    );
  });

  test("ciclo de vida UI: alta, edición y blanqueo de contraseña", async ({
    page,
  }) => {
    const uname = uniq();
    createdUsernames.push(uname);

    await page.goto("/admin/usuarios");
    await page.locator("#btn-nuevo-usuario").click();

    const modal = page.locator("#modal-create-user");
    await expect(modal).toBeVisible();

    await modal.locator("#admin-username").fill(uname);
    await modal.locator("#admin-password").fill(VALID_PASSWORD);
    await modal.locator("#admin-password-repeat").fill(VALID_PASSWORD);
    await modal.locator("#admin-fullname").fill(`E2E Create Modal ${uname}`);
    await modal.locator("#admin-role").selectOption("team_leader");
    await modal
      .locator("#admin-helpdesk")
      .selectOption({ label: MDA_TI_MESA });

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
        { timeout: 15000 },
      ),
      modal.locator('button[type="submit"]').first().click(),
    ]);
    expect(createResponse.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const row = page.locator(`article[data-sort-username="${uname}"]`);
    await row.waitFor({ state: "visible", timeout: 10000 });

    await row.locator('button[aria-label^="Editar usuario"]').click();
    const editDialog = page.locator("dialog[open]");
    await expect(editDialog).toBeVisible();

    await editDialog.locator('input[name="enCronograma"]').uncheck();
    await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      const form = dialog?.querySelector("form");
      if (form) form.requestSubmit();
    });
    await page.waitForLoadState("networkidle");

    await expect
      .poll(
        async () =>
          (
            await db
              .select({ enCronograma: agents.enCronograma })
              .from(agents)
              .where(
                sql`lower(coalesce(${agents.username}, '')) = ${uname.toLowerCase()}`,
              )
          )[0]?.enCronograma,
        { timeout: 10000 },
      )
      .toBe(false);

    const [before] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.username, uname));

    const resetRow = page.locator(`article[data-sort-username="${uname}"]`);
    await resetRow.waitFor({ state: "visible", timeout: 10000 });
    await resetRow
      .locator('button[aria-label^="Blanquear contraseña"]')
      .click();
    const resetDialog = page.locator("dialog[open]");
    await expect(resetDialog).toBeVisible();

    await resetDialog.locator('input[name="newPassword"]').fill(VALID_PASSWORD);
    await resetDialog.locator('input[type="password"]').last().fill(VALID_PASSWORD);
    await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      const form = dialog?.querySelector("form");
      if (form) form.requestSubmit();
    });
    await page.waitForLoadState("networkidle");

    await expect
      .poll(
        async () =>
          (
            await db
              .select({ password: users.password })
              .from(users)
              .where(eq(users.username, uname))
          )[0]?.password,
        { timeout: 10000 },
      )
      .not.toBe(before.password);
  });
});
