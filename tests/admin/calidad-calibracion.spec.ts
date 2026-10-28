import "dotenv/config";
import { expect, test } from "@playwright/test";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "../helpers/auth";

let admin: TestUser;
let supervisor: TestUser;

test.beforeAll(async () => {
  admin = await createTestUserAndSession("admin", { helpdeskName: "TI_GSM_MDA TI" });
  supervisor = await createTestUserAndSession("supervisor", { helpdeskName: "TI_GSM_MDA TI" });
});

test.afterAll(async () => {
  await cleanupTestUser(admin.userId, admin.sessionId);
  await cleanupTestUser(supervisor.userId, supervisor.sessionId);
});

test("la página de calibración compila y renderiza para un usuario administrador (#370)", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);

  const response = await page.goto("/admin/calidad/calibracion");
  expect(response?.status()).toBe(200);

  // Verifica que la página y el componente server island compilen y rendericen sin PARSE_ERROR
  await expect(page.getByRole("heading", { name: "Calibración de Calidad IA (Ground Truth)" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Volver a Calidad de Operadores")).toBeVisible();
});

test("un supervisor no tiene acceso a calibración y no ve el botón en calidad", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, supervisor.signedSessionId);

  // 1. Acceso directo redirige al home con toast de error de autorización
  await page.goto("/admin/calidad/calibracion");
  await expect(page).not.toHaveURL(/\/admin\/calidad\/calibracion/);
  await expect(page.locator("#global-toast-container")).toContainText(/Acceso no autorizado/i);

  // 2. En la vista de calidad no se muestra el botón de Calibración IA
  await page.goto("/supervision/calidad-operadores");
  await expect(page.locator("#btn-calibracion-ia")).toHaveCount(0);
});
