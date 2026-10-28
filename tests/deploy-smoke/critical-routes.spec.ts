import "dotenv/config";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, agents } from "../../src/db/schema";
import { hashPassword } from "../../src/lib/security";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

const MDA_TI_MESA = "TI_GSM_MDA TI";
const CURRENT_PASSWORD = "SmokeActual123";

let supervisor: TestUser;

test.beforeAll(async () => {
  supervisor = await createTestUserAndSession("supervisor", {
    helpdeskName: MDA_TI_MESA,
  });
  await db
    .update(users)
    .set({ password: await hashPassword(CURRENT_PASSWORD) })
    .where(eq(users.id, supervisor.userId));
});

test.afterAll(async () => {
  if (supervisor) {
    await cleanupTestUser(supervisor.userId, supervisor.sessionId);
  }
});

const ROUTES: { path: string; ready: string }[] = [
  { path: "/supervision/asistencia", ready: "#attendance-table-body .main-attendance-row" },
  { path: "/supervision/asistencia/estadisticas", ready: "h1" },
  { path: "/supervision/cronograma", ready: "#monthly-view" },
  { path: "/supervision/calidad-operadores", ready: "#operators-sort-root" },
  { path: "/supervision/calidad-operadores/nueva", ready: "#audit-form" },
  { path: "/supervision/autogestiones-metricas", ready: "#presets-filter-bar" },
  { path: "/supervision/asignacion-autogestiones", ready: "#tab-btn-asignacion" },
  { path: "/oficinas", ready: "#office-filters-form" },
  { path: "/inventario-terminales", ready: "#inventory-view-switcher" },
];

test.describe("Rutas críticas post-build", () => {
  for (const route of ROUTES) {
    test(`${route.path} responde 200 y renderiza contenido`, async ({ page, context }) => {
      await setSessionCookie(context, supervisor.signedSessionId);

      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(route.path);

      await expect(page.locator(route.ready).first()).toBeVisible({ timeout: 20_000 });
    });
  }
});

test("la ficha de operador de asistencia renderiza con un agente real", async ({ page, context }) => {
  const [agent] = await db.select({ id: agents.id }).from(agents).limit(1);
  expect(agent, "la base no tiene agentes para probar la ficha").toBeTruthy();

  await setSessionCookie(context, supervisor.signedSessionId);
  const path = `/supervision/asistencia/operador/${agent.id}`;
  const response = await page.goto(path);

  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(page.locator("#operator-header-card")).toBeVisible({ timeout: 20_000 });
});

test.describe("Formulario operativo", () => {
  test("el blanqueo de contraseña valida, muta y confirma", async ({ page, context }) => {
    await setSessionCookie(context, supervisor.signedSessionId);
    await page.goto("/profile");

    await page
      .locator("main")
      .getByRole("button", { name: /blanqueo de contrase[ñn]a/i })
      .click();
    const dialog = page.locator("#modal-self-password");
    await expect(dialog).toBeVisible();

    await dialog.locator("#self-current-password").fill(CURRENT_PASSWORD);
    const newPassword = "SmokeNueva123";
    await dialog.locator("#self-new-password").fill(newPassword);
    await dialog.locator("#self-new-password-repeat").fill(newPassword);
    await dialog.getByRole("button", { name: /guardar/i }).click();

    await page.waitForURL(/\/login/);
    await expect(page.locator("#global-toast-container")).toContainText(
      "Contraseña actualizada",
    );
  });
});
