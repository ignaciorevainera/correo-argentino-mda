import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

let admin: TestUser;

test.beforeAll(async () => {
  admin = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(admin.userId, admin.sessionId);
});

test.beforeEach(async ({ context }) => {
  await setSessionCookie(context, admin.signedSessionId);
});

async function getJson(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const res = await fetch(p, { credentials: "include" });
    return { ok: res.ok, status: res.status, body: await res.json() };
  }, path);
}

async function waitForOptions(page: Page, id: string) {
  await page.waitForFunction(
    (sel) => document.querySelectorAll(`${sel} option`).length > 1,
    `#${id}`,
    { timeout: 20_000 },
  );
}

test.describe("API estadísticas de oficinas", () => {
  test("los filtros de región, provincia y tipo afectan KPIs y ranking por igual", async ({
    page,
  }) => {
    await page.goto("/oficinas/estadisticas");
    const base = await getJson(page, "/api/oficinas/estadisticas");
    expect(base.ok).toBe(true);

    const region = base.body.filtros.regiones[0] as string;
    expect(region).toBeTruthy();
    expect(base.body.filtros.regiones).not.toContain("METROPOLITANA");
    expect(base.body.filtros.regiones).not.toContain("CENTRO - NEA");

    const byRegion = await getJson(
      page,
      `/api/oficinas/estadisticas?region=${encodeURIComponent(region)}`,
    );
    expect(byRegion.ok).toBe(true);
    expect(byRegion.body.ranking.total).toBeGreaterThan(0);
    expect(byRegion.body.ranking.total).toBeLessThan(base.body.ranking.total);
    expect(byRegion.body.kpis.oficinasTotal).toBe(byRegion.body.ranking.total);
    for (const row of byRegion.body.ranking.rows) {
      expect(row.region).toBe(region);
    }

    const provincia = base.body.filtros.provincias[0] as string;
    const byProvincia = await getJson(
      page,
      `/api/oficinas/estadisticas?provincia=${encodeURIComponent(provincia)}`,
    );
    expect(byProvincia.ok).toBe(true);
    expect(byProvincia.body.ranking.total).toBeGreaterThan(0);
    expect(byProvincia.body.ranking.total).toBeLessThan(base.body.ranking.total);
    expect(byProvincia.body.kpis.oficinasTotal).toBe(byProvincia.body.ranking.total);
    expect(byProvincia.body.charts.porProvincia.labels).toEqual([provincia]);
    for (const row of byProvincia.body.ranking.rows) {
      expect(row.provincia).toBe(provincia);
    }

    const tipo = base.body.filtros.tipos[0] as string;
    const byTipo = await getJson(
      page,
      `/api/oficinas/estadisticas?tipo=${encodeURIComponent(tipo)}`,
    );
    expect(byTipo.ok).toBe(true);
    expect(byTipo.body.ranking.total).toBeGreaterThan(0);
    expect(byTipo.body.ranking.total).toBeLessThan(base.body.ranking.total);
    expect(byTipo.body.kpis.oficinasTotal).toBe(byTipo.body.ranking.total);
  });
});

test.describe("UI estadísticas de oficinas", () => {
  test("elegir una región actualiza el total y los KPIs", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/oficinas/estadisticas");
    await waitForOptions(page, "stats-region");

    const total = page.locator("[data-ranking-total]");
    const usuarios = page.locator('[data-kpi="usuarios"] [data-kpi-value]');
    const totalBefore = await total.innerText();
    const kpiBefore = await usuarios.innerText();

    const regionValue = await page
      .locator("#stats-region option")
      .nth(1)
      .getAttribute("value");
    expect(regionValue).toBeTruthy();

    await page.selectOption("#stats-region", regionValue as string);

    await expect.poll(() => total.innerText(), { timeout: 20_000 }).not.toBe(totalBefore);
    await expect.poll(() => usuarios.innerText(), { timeout: 20_000 }).not.toBe(kpiBefore);
    expect(pageErrors).toEqual([]);
  });
});

test.describe("UI estadísticas de terminales", () => {
  test("elegir una región acota provincias y actualiza los KPIs", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const initialLoad = page.waitForResponse(
      (response) =>
        response.url().includes("/api/terminals/estadisticas") && response.status() === 200,
      { timeout: 20_000 },
    );

    await page.goto("/inventario-terminales/estadisticas");
    await waitForOptions(page, "stats-region");
    await initialLoad;

    const provincias = page.locator("#stats-provincia option");
    const totalKpi = page.locator('[data-kpi="total"] [data-kpi-value]');
    const provinciasBefore = await provincias.count();
    const kpiBefore = await totalKpi.innerText();

    const regionValue = await page
      .locator("#stats-region option")
      .nth(1)
      .getAttribute("value");
    expect(regionValue).toBeTruthy();

    const filteredRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/terminals/estadisticas") &&
        request.url().includes(`region=${encodeURIComponent(regionValue as string)}`),
      { timeout: 20_000 },
    );
    await page.selectOption("#stats-region", regionValue as string);
    await filteredRequest;

    await expect.poll(() => provincias.count(), { timeout: 20_000 }).toBeLessThan(
      provinciasBefore,
    );
    await expect.poll(() => totalKpi.innerText(), { timeout: 20_000 }).not.toBe(kpiBefore);
    expect(pageErrors.join("\n")).not.toContain("provinciaSelect");
  });
});
