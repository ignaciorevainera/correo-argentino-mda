import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
} from "../helpers/auth";
import { db } from "../../src/db/index";
import { employees } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const suffix = Date.now();
const TEST_DNI = "9" + String(suffix).slice(-7);
const TEST_USERNAME = `test_editgate_${suffix}`;

let agentUser: Awaited<ReturnType<typeof createTestUserAndSession>>;

test.beforeAll(async () => {
  agentUser = await createTestUserAndSession("agent");
  await db.insert(employees).values({
    dni: TEST_DNI,
    username: TEST_USERNAME,
    fullname: `Edit Gate ${suffix}`,
    interno: "1111",
    telefono: "222-2222",
    sucursal: "",
  });
});

test.afterAll(async () => {
  await db.delete(employees).where(eq(employees.dni, TEST_DNI));
  await cleanupTestUser(agentUser.userId, agentUser.sessionId);
});

async function searchCard(page: Page, username: string) {
  await page.goto("/buscador-usuarios");
  await page.fill("#search-input", username);
  await expect(
    page.locator(".card:not(.skeleton-debounced)").first(),
  ).toBeVisible({ timeout: 15000 });
  const card = page.locator(".card").filter({
    has: page.locator(".user-card-username-btn", { hasText: username }),
  });
  await expect(card).toHaveCount(1);
  return card;
}

test("sin sesión no ve el botón de editar", async ({ page }) => {
  const card = await searchCard(page, TEST_USERNAME);
  await expect(card.locator("[data-edit-user-btn]")).toHaveCount(0);
});

test("agente ve el botón, abre el modal y guarda interno y teléfono", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agentUser.signedSessionId);
  const card = await searchCard(page, TEST_USERNAME);
  await expect(card.locator("[data-edit-user-btn]")).toHaveCount(1);

  await card.locator("[data-edit-user-btn]").click();
  await expect(page.locator("#edit-user-modal")).toBeVisible();

  await page.fill("#edit-user-interno", "3333");
  await page.fill("#edit-user-telefono", "1160000000");
  await page.click("#save-edit-btn");

  await expect(page.locator("#edit-user-modal")).toBeHidden();
  const [row] = await db
    .select()
    .from(employees)
    .where(eq(employees.dni, TEST_DNI));
  expect(row.interno).toBe("3333");
  expect(row.telefono).toBe("1160000000");
});
