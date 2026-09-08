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

test("La barra de busqueda y las acciones ocupan la segunda fila", async ({
  page,
}) => {
  await page.goto("/mesas-de-ayuda");

  const searchInput = page.locator("#soportes-search");
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toHaveAttribute(
    "placeholder",
    "Buscar por nombre SM, Invgate, tópico…",
  );

  const searchBar = page.locator('label[for="soportes-search"]');
  const searchBox = await searchBar.boundingBox();
  const statusBox = await page.locator("#filter-status").boundingBox();
  const clearBox = await page.locator("#clear-filters").boundingBox();
  expect(searchBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(clearBox).not.toBeNull();

  expect(searchBox!.width).toBeGreaterThanOrEqual(350);
  expect(searchBox!.y).toBeGreaterThan(statusBox!.y);
  expect(Math.abs(searchBox!.y - clearBox!.y)).toBeLessThanOrEqual(10);
});

test("Los selects de filtro permanecen en la fila superior", async ({
  page,
}) => {
  await page.goto("/mesas-de-ayuda");
  await expect(page.locator("#soportes-search")).toBeVisible();

  const statusBox = await page.locator("#filter-status").boundingBox();
  const sortBox = await page.locator("#sort-by").boundingBox();
  expect(statusBox).not.toBeNull();
  expect(sortBox).not.toBeNull();
  expect(Math.abs(statusBox!.y - sortBox!.y)).toBeLessThanOrEqual(10);

  const parentSelect = page.locator("#filter-parent");
  if ((await parentSelect.count()) > 0) {
    const parentBox = await parentSelect.boundingBox();
    expect(parentBox).not.toBeNull();
    expect(Math.abs(statusBox!.y - parentBox!.y)).toBeLessThanOrEqual(10);
  }
});

test("En pantallas angostas el placeholder sigue visible", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/mesas-de-ayuda");

  const searchInput = page.locator("#soportes-search");
  await expect(searchInput).toBeVisible();

  const searchBar = page.locator('label[for="soportes-search"]');
  const searchBox = await searchBar.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.width).toBeGreaterThanOrEqual(350);
});
