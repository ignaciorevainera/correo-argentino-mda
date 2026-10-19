import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

// 12:00 UTC evita el corrimiento de día en cualquier huso de Argentina.
const ISO_SUCCESS = "2026-01-15T12:00:00.000Z";
const ISO_EXECUTION = "2026-01-16T12:00:00.000Z";
const RAW_ERROR = "connect ECONNREFUSED 10.1.10.51:389 (VPN caída)";

let agent: TestUser;
let admin: TestUser;

test.beforeAll(async () => {
  agent = await createTestUserAndSession("agent");
  admin = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  if (agent) await cleanupTestUser(agent.userId, agent.sessionId);
  if (admin) await cleanupTestUser(admin.userId, admin.sessionId);
});

async function routeStatus(page: Page, lastSync: unknown): Promise<void> {
  await page.route("**/api/usuarios/status*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        serverTime: new Date().toISOString(),
        lastSync,
      }),
    }),
  );
}

async function loadPage(page: Page): Promise<void> {
  await page.goto("/buscador-usuarios", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#sync-status:not(:empty)");
}

test("agente: última corrida fallida muestra la fecha de la última sincronización exitosa, sin aviso", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agent.signedSessionId);
  await routeStatus(page, {
    lastExecution: ISO_EXECUTION,
    lastSuccessAt: ISO_SUCCESS,
    status: "error",
    error: RAW_ERROR,
  });
  await loadPage(page);

  const syncStatus = page.locator("#sync-status");
  await expect(syncStatus).toContainText("Última sinc.:");
  await expect(syncStatus).toContainText("15/01/2026");
  await expect(syncStatus).not.toContainText("aviso");
  await expect(syncStatus).not.toContainText("ECONNREFUSED");
  await expect(syncStatus).not.toContainText("VPN");
  await expect(syncStatus.locator(".badge")).toHaveCount(0);
});

test("agente: error sin éxito previo muestra el estado sin alarma ni detalle técnico", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agent.signedSessionId);
  await routeStatus(page, {
    lastExecution: ISO_EXECUTION,
    status: "error",
    error: RAW_ERROR,
  });
  await loadPage(page);

  const syncStatus = page.locator("#sync-status");
  await expect(syncStatus).toContainText("Sin sincronización exitosa");
  await expect(syncStatus).not.toContainText("aviso");
  await expect(syncStatus).not.toContainText("ECONNREFUSED");
  await expect(syncStatus.locator(".badge")).toHaveCount(0);
});

test("agente: sin sincronización previa muestra el estado por defecto", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agent.signedSessionId);
  await routeStatus(page, null);
  await loadPage(page);

  await expect(page.locator("#sync-status")).toContainText(
    "Sin sincronización previa",
  );
});

test("admin: la corrida fallida expone un indicador discreto con el detalle en el title", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  await routeStatus(page, {
    lastExecution: ISO_EXECUTION,
    lastSuccessAt: ISO_SUCCESS,
    status: "error",
    error: RAW_ERROR,
  });
  await loadPage(page);

  const badge = page.locator("#sync-status .badge");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveAttribute("title", RAW_ERROR);
  // El detalle solo vive en el title: nunca como texto visible.
  await expect(page.locator("#sync-status")).not.toContainText("ECONNREFUSED");
});
