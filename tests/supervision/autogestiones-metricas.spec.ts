import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie } from "../helpers/auth";

let supervisorUser: Awaited<ReturnType<typeof createTestUserAndSession>>;
let agentUser: Awaited<ReturnType<typeof createTestUserAndSession>>;

test.beforeAll(async () => {
  supervisorUser = await createTestUserAndSession("supervisor");
  agentUser = await createTestUserAndSession("agent");
});

test.afterAll(async () => {
  if (supervisorUser) await cleanupTestUser(supervisorUser.userId, supervisorUser.sessionId);
  if (agentUser) await cleanupTestUser(agentUser.userId, agentUser.sessionId);
});

test("RBAC: el rol agent no puede acceder a /supervision/autogestiones-metricas", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, agentUser.signedSessionId);
  const response = await page.goto("/supervision/autogestiones-metricas");
  const url = page.url();
  expect(url.includes("/login") || response?.status() === 403).toBe(true);
});

test("Acceso permitido para supervisor: visualización de KPIs, gráficos y controles", async ({
  context,
  page,
}) => {
  await setSessionCookie(context, supervisorUser.signedSessionId);
  const response = await page.goto("/supervision/autogestiones-metricas");
  expect(response?.status()).toBe(200);

  // Encabezado
  await expect(page.locator("h1")).toContainText("Métricas de Autogestiones");

  // KPIs presentes
  await expect(page.locator("#kpi-total-asignadas")).toBeVisible();
  await expect(page.locator("#kpi-cola-pendiente")).toBeVisible();
  await expect(page.locator("#kpi-tasa-automatizacion")).toBeVisible();
  await expect(page.locator("#kpi-operadores-activos")).toBeVisible();

  // Filtros de presets y botones
  await expect(page.locator("#presets-filter-bar")).toBeVisible();
  await expect(page.locator("#btn-export-csv")).toBeVisible();
  await expect(page.locator("#btn-refresh-metrics")).toBeVisible();

  // Canvas de los 5 gráficos
  await expect(page.locator("#chart-modalidades")).toBeVisible();
  await expect(page.locator("#chart-temporal")).toBeVisible();
  await expect(page.locator("#chart-operadores")).toBeVisible();
  await expect(page.locator("#chart-categorias")).toBeVisible();
  await expect(page.locator("#chart-creadores")).toBeVisible();

  // Tabla de asignaciones
  await expect(page.locator("#table-assignments-body")).toBeVisible();
});

test("API: /api/autogestion/metricas responde JSON con estructura válida", async ({
  request,
}) => {
  const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
  const res = await request.get(`${baseURL}/api/autogestion/metricas?preset=hoy`, {
    headers: {
      Cookie: `session_id=${supervisorUser.signedSessionId}`,
    },
  });

  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.data).toBeDefined();
  expect(json.data.kpis).toBeDefined();
  expect(json.data.temporal).toBeDefined();
  expect(json.data.byOperator).toBeDefined();
  expect(json.data.byType).toBeDefined();
});

test("API: /api/autogestion/metricas/export.csv descarga archivo CSV con cabeceras", async ({
  request,
}) => {
  const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
  const res = await request.get(`${baseURL}/api/autogestion/metricas/export.csv?preset=ultimos_7_dias`, {
    headers: {
      Cookie: `session_id=${supervisorUser.signedSessionId}`,
    },
  });

  expect(res.status()).toBe(200);
  const contentType = res.headers()["content-type"];
  expect(contentType).toContain("text/csv");
  const text = await res.text();
  expect(text).toContain("ID,Ticket,Operador,Asignado Por,Tipo,Fecha Hora");
});
