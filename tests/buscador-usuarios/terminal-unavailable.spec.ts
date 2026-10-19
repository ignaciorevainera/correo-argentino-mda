import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

const NEUTRAL =
  "El servicio no está disponible en este momento. Intente nuevamente en unos minutos.";
const TECH_AD = "Error de conexión: No se pudo conectar con el servidor corporativo. timeout VPN";
const TECH_INVGATE = "502: upstream timeout contacting InvGate API";

const SEARCH_RESULT = {
  results: [
    {
      fullname: "Juan Doe",
      dni: "12345678",
      username: "jdoe",
      interno: "1000",
      telefono: "555-0000",
      sucursal: "CEN",
      sucursalNombre: "Central",
      sucursales: [],
      invgateExists: true,
    },
  ],
  total: 1,
};

let agent: TestUser;

test.beforeAll(async () => {
  agent = await createTestUserAndSession("agent");
});

test.afterAll(async () => {
  if (agent) await cleanupTestUser(agent.userId, agent.sessionId);
});

async function openModal(
  page: Page,
  netUser: { status: number; body: unknown },
): Promise<void> {
  await page.route("**/api/usuarios/search*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SEARCH_RESULT),
    }),
  );
  await page.route("**/api/usuarios/net-user*", (route) =>
    route.fulfill({
      status: netUser.status,
      contentType: "application/json",
      body: JSON.stringify(netUser.body),
    }),
  );

  await page.goto("/buscador-usuarios", { waitUntil: "domcontentloaded" });
  await page.fill("#search-input", "jdoe");
  await page.press("#search-input", "Enter");
  await page.waitForSelector("#results-grid > *");
  await page.locator("[data-net-user-btn]").first().click();
  await page.waitForSelector("#terminal-modal[open]");
  await page.waitForTimeout(800);
}

test("AD responde error técnico con 200: aviso neutral, sin jerga", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agent.signedSessionId);
  await openModal(page, {
    status: 200,
    body: { status: "error", error: TECH_AD, output: `Error: ${TECH_AD}` },
  });

  await expect(page.locator("#terminal-unavailable")).toBeVisible();
  await expect(page.locator("#terminal-unavailable")).toContainText(NEUTRAL);
  const html = await page.locator("#terminal-modal").innerHTML();
  expect(html).not.toContain("VPN");
  expect(html).not.toContain("timeout");
  expect(html).not.toContain("Error:");
});

test("AD responde 500: aviso neutral, sin jerga", async ({ context, page }) => {
  await setSessionCookie(context, agent.signedSessionId);
  await openModal(page, {
    status: 500,
    body: { error: TECH_AD },
  });

  await expect(page.locator("#terminal-unavailable")).toBeVisible();
  await expect(page.locator("#terminal-unavailable")).toContainText(NEUTRAL);
  const html = await page.locator("#terminal-modal").innerHTML();
  expect(html).not.toContain("VPN");
  expect(html).not.toContain("Error:");
});

test("usuario no encontrado en AD: mensaje propio, sin aviso de servicio", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agent.signedSessionId);
  await openModal(page, {
    status: 200,
    body: {
      status: "error",
      reason: "not_found",
      error: 'Usuario "jdoe" no encontrado en Active Directory',
      output: 'Usuario "jdoe" no encontrado en Active Directory.',
    },
  });

  await expect(page.locator("#terminal-unavailable")).toBeHidden();
  await expect(page.locator("#terminal-output")).toContainText(
    "no encontrado en Active Directory",
  );
});

test("AD responde OK: render normal, sin aviso", async ({ context, page }) => {
  await setSessionCookie(context, agent.signedSessionId);
  await openModal(page, {
    status: 200,
    body: {
      status: "success",
      output: "salida de prueba",
      employee_number: "1234",
      fullname: "Juan Doe",
      groups: [],
    },
  });

  await expect(page.locator("#terminal-unavailable")).toBeHidden();
  await expect(page.locator("#term-info-fullname")).toHaveText("Juan Doe");
});

test("InvGate falla con error técnico: aviso neutral en su pestaña", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agent.signedSessionId);
  await page.route("**/api/usuarios/invgate-user*", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: TECH_INVGATE }),
    }),
  );
  await openModal(page, {
    status: 200,
    body: {
      status: "success",
      output: "salida de prueba",
      employee_number: "1234",
      fullname: "Juan Doe",
      groups: [],
    },
  });

  await page.click("#tab-invgate-btn");
  await expect(page.locator("#invgate-error")).toBeVisible();
  await expect(page.locator("#invgate-error")).toContainText(NEUTRAL);
  const invgateHtml = await page.locator("#view-invgate").innerHTML();
  expect(invgateHtml).not.toContain("timeout");
  expect(invgateHtml).not.toContain("502");
});
