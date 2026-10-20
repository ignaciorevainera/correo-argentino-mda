// tests/admin/edificios-card-lock.spec.ts
//
// #176: la card "Agrupación de oficinas" depende de /admin/oficinas/edificios,
// ruta exclusiva de admin (src/lib/rbac.ts:78). Un supervisor con mesa MDA TI
// ve el panel /admin pero la card debe estar bloqueada, y entrar por URL debe
// redirigirlo (302), no devolver 403: el middleware redirige a la home con toast.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

const CARD_LABEL = "Ir a Agrupación de oficinas";

test.describe("Card de oficinas bloqueada por rol (#176)", () => {
  let admin: TestUser;
  let supervisor: TestUser;

  test.beforeAll(async () => {
    admin = await createTestUserAndSession("admin");
    supervisor = await createTestUserAndSession("supervisor", {
      helpdeskName: "TI_GSM_MDA TI",
    });
  });

  test.afterAll(async () => {
    await cleanupTestUser(admin.userId, admin.sessionId);
    await cleanupTestUser(supervisor.userId, supervisor.sessionId);
  });

  test("admin ve la card como enlace navegable", async ({ context, page }) => {
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/admin");

    const link = page.locator(`a[aria-label="${CARD_LABEL}"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /\/admin\/oficinas\/edificios$/);

    await link.click();
    await expect(page).toHaveURL(/\/admin\/oficinas\/edificios$/);
  });

  test("supervisor ve la card bloqueada y sin enlace", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, supervisor.signedSessionId);
    await page.goto("/admin");

    await expect(page.locator("h1")).toContainText("Administración");
    await expect(page.locator(`a[aria-label="${CARD_LABEL}"]`)).toHaveCount(0);

    const locked = page
      .locator('div[aria-disabled="true"]')
      .filter({ hasText: "Agrupación de oficinas" });
    await expect(locked).toBeVisible();
    await expect(locked).toHaveAttribute("title", "Acceso restringido por rol");
  });

  test("supervisor que entra por URL es redirigido a la home con alerta", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, supervisor.signedSessionId);

    const response = await page.goto("/admin/oficinas/edificios");
    expect(response?.status()).toBe(200);

    // ToastContainer consume toast_msg y limpia la query (ToastContainer.astro:91-93),
    // así que la URL final es "/" y la alerta queda en el DOM.
    await expect(
      page.getByText("Acceso no autorizado", { exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });
});
