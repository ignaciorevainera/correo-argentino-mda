// tests/admin/suggest-helpdesk-feedback.spec.ts
//
// El boton "Sugerir" del modal unificado de edicion debe usar el estilo de
// y dar feedback mientras consulta InvGate: loading (disabled + spinner) y toast
// de exito/aviso/error segun la respuesta.
import "dotenv/config";
import { test, expect, type Route } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions } from "../../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const sign = (id: string) => `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

test.describe("Sugerir mesa: estilo y feedback", () => {
  let adminId = 0;
  let adminSess = "";
  const createdUserIds: number[] = [];
  const createdSessions: string[] = [];

  test.beforeAll(async () => {
    const ts = Date.now();
    const [admin] = await db
      .insert(users)
      .values({ username: `sug_admin_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = admin.id;
    adminSess = `sess_sug_admin_${ts}`;
    await db.insert(sessions).values({ id: adminSess, userId: adminId, expiresAt: Date.now() + 86400000 });
    createdSessions.push(adminSess);
  });

  test.afterAll(async () => {
    for (const s of createdSessions) await db.delete(sessions).where(eq(sessions.id, s));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function seedTarget(role: string): Promise<{ id: number; username: string }> {
    const username = `sug_target_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const [u] = await db
      .insert(users)
      .values({ username, password: "x", role })
      .returning({ id: users.id });
    createdUserIds.push(u.id);
    return { id: u.id, username };
  }

  async function login(context: any, sessionId: string): Promise<void> {
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: sign(sessionId), domain: new URL(base).hostname, path: "/" },
    ]);
  }

  async function openModal(page: any, target: { id: number }): Promise<void> {
    await page.goto("/admin/usuarios");
    await page.locator(`[data-edit-user-btn][data-user-id="${target.id}"]`).click();
    await expect(page.locator(`#edit-user-helpdesk-${target.id}`)).toBeVisible();
  }

  test("usa el estilo ActionButton (btn-soft btn-secondary)", async ({ context, page }) => {
    const target = await seedTarget("agent");
    await login(context, adminSess);
    await openModal(page, target);
    const btn = page.locator(`#suggest-helpdesk-btn-${target.id}`);
    await expect(btn).toBeVisible();
    const cls = (await btn.getAttribute("class")) || "";
    expect(cls).toContain("btn-soft");
    expect(cls).toContain("btn-secondary");
  });

  test("queda alineado con el select de mesa de ayuda", async ({ context, page }) => {
    const target = await seedTarget("agent");
    await login(context, adminSess);
    await openModal(page, target);
    const sel = await page.locator(`#edit-user-helpdesk-${target.id}`).boundingBox();
    const btn = await page.locator(`#suggest-helpdesk-btn-${target.id}`).boundingBox();
    if (!sel || !btn) throw new Error("sin bounding box");
    // Mismo alto y misma base (el fieldset de DaisyUI agrega 4px abajo).
    expect(Math.abs(sel.height - btn.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(sel.y + sel.height - (btn.y + btn.height))).toBeLessThanOrEqual(1);
  });

  test("loading + toast de exito al sugerir", async ({ context, page }) => {
    const target = await seedTarget("agent");
    await login(context, adminSess);
    await page.route("**/api/admin/suggest-helpdesk*", async (route: Route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ helpdesk: { invgateId: 910010, name: "TI_GSM_MDA TI" } }),
      });
    });
    await openModal(page, target);
    const btn = page.locator(`#suggest-helpdesk-btn-${target.id}`);
    await btn.click();

    // Feedback inmediato: deshabilitado + spinner.
    await expect(btn).toBeDisabled();
    await expect(btn.locator(".loading")).toHaveCount(1);

    // Resultado positivo: opcion seleccionada + toast de exito + boton restaurado.
    await expect(page.locator(`#edit-user-helpdesk-${target.id}`)).toHaveValue("910010|TI_GSM_MDA TI");
    await expect(page.locator("#global-toast-container")).toContainText(/sugerida/i, { timeout: 5000 });
    await expect(btn).toBeEnabled();
  });

  test("aviso cuando no hay coincidencia", async ({ context, page }) => {
    const target = await seedTarget("agent");
    await login(context, adminSess);
    await page.route("**/api/admin/suggest-helpdesk*", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ helpdesk: null }),
      }),
    );
    await openModal(page, target);
    const btn = page.locator(`#suggest-helpdesk-btn-${target.id}`);
    await btn.click();
    await expect(page.locator("#global-toast-container")).toContainText(/no se encontr/i, { timeout: 5000 });
    await expect(btn).toBeEnabled();
  });

  test("error de InvGate muestra toast de error y restaura el boton", async ({ context, page }) => {
    const target = await seedTarget("agent");
    await login(context, adminSess);
    await page.route("**/api/admin/suggest-helpdesk*", (route: Route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "No se pudo consultar InvGate" }),
      }),
    );
    await openModal(page, target);
    const btn = page.locator(`#suggest-helpdesk-btn-${target.id}`);
    await btn.click();
    await expect(page.locator("#global-toast-container")).toContainText(/no se pudo/i, { timeout: 5000 });
    await expect(btn).toBeEnabled();
  });
});
