import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";

let adminUser: TestUser;

test.beforeAll(async () => {
  adminUser = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(adminUser.userId, adminUser.sessionId);
});

test.beforeEach(async ({ context }) => {
  await setSessionCookie(context, adminUser.signedSessionId);
});

test("El editor muestra multi-select de categorías y tag input de tópicos", async ({
  page,
}) => {
  await page.goto("/mesas-de-ayuda");

  const editLink = page
    .locator("a[href*='mesas-de-ayuda/edit?invgate_id=']")
    .first();
  if ((await editLink.count()) === 0) {
    test.skip(true, "Sin mesas de ayuda editables (sin rol admin o sin datos)");
  }
  await editLink.click();

  await expect(page.locator("[data-multiselect-root]")).toBeVisible();
  await expect(page.locator("[data-taginput-root]")).toBeVisible();
});

test("El editor no muestra el campo de contactos", async ({ page }) => {
  await page.goto("/mesas-de-ayuda");

  const editLink = page
    .locator("a[href*='mesas-de-ayuda/edit?invgate_id=']")
    .first();
  if ((await editLink.count()) === 0) {
    test.skip(true, "Sin mesas de ayuda editables");
  }
  await editLink.click();

  await expect(page.locator("textarea[name='contacts']")).toHaveCount(0);
  await expect(page.locator("input[name='contacts']")).toHaveCount(0);
});

test("El tag input agrega un tópico con Enter", async ({ page }) => {
  await page.goto("/mesas-de-ayuda");

  const editLink = page
    .locator("a[href*='mesas-de-ayuda/edit?invgate_id=']")
    .first();
  if ((await editLink.count()) === 0) {
    test.skip(true, "Sin mesas de ayuda editables");
  }
  await editLink.click();

  const tagInput = page.locator("[data-taginput-input]");
  await tagInput.fill("VPN");
  await tagInput.press("Enter");

  await expect(
    page.locator("[data-taginput-chip]", { hasText: "VPN" }),
  ).toHaveCount(1);
});
