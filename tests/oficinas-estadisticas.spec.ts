import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/index";
import {
  employeeOffices,
  officeInvgateLinks,
  offices,
  provinces,
  sessions,
  terminals,
  users,
} from "../src/db/schema";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

const stamp = Date.now();
const agentSessionId = `sess_of_agent_${stamp}`;
const supervisorSessionId = `sess_of_sup_${stamp}`;
const officeCode = `T${stamp}`;
let agentId = 0;
let supervisorId = 0;
let officeId = 0;
const closedOfficeCode = `C${stamp}`;
let closedOfficeId = 0;
const accentOfficeCode = `A${stamp}`;
let accentOfficeId = 0;

function panelFixture(overrides: Record<string, unknown> = {}) {
  return {
    period: "last30d",
    kpis: {
      oficinasActivas: 2,
      oficinasTotal: 3,
      usuarios: 120,
      terminales: 40,
      incidentesAbiertos: 7,
      eventosMasivosActivos: 1,
    },
    charts: {
      porProvincia: { labels: ["Buenos Aires"], series: [{ label: "Oficinas", data: [2] }] },
      porRegion: { labels: ["Metro"], series: [{ label: "Oficinas", data: [2] }] },
      modernizacion: {
        labels: ["Buenos Aires"],
        series: [
          { label: "Cerrados", data: [3] },
          { label: "En curso", data: [1] },
        ],
      },
    },
    eventosMasivos: [
      {
        categoriaId: 257,
        titulo: "STS - Desconexión de agentes",
        oficinas: 6,
        tickets: 9,
        desde: Date.now() - 3600000,
        officeCodes: [officeCode],
        provincias: ["Buenos Aires"],
      },
    ],
    ranking: {
      rows: [
        {
          code: officeCode,
          name: "Sucursal E2E",
          provincia: "Buenos Aires",
          region: "Metro",
          usuarios: 12,
          incidentes: 2,
          eventos: 1,
          terminales: 3,
          activa: true,
        },
        {
          code: "ZZZZ",
          name: "Oficina Zeta",
          provincia: "Córdoba",
          region: "Centro",
          usuarios: 5,
          incidentes: 0,
          eventos: 0,
          terminales: 1,
          activa: false,
        },
      ],
      total: 30,
      page: 1,
      pageSize: 25,
    },
    filtros: {
      provincias: ["Buenos Aires", "Córdoba"],
      regiones: ["Metro", "Centro"],
      tipos: ["Sucursal", "CPA"],
    },
    meta: { invgateOk: true, snapshotAt: new Date().toISOString(), massEventMinOffices: 5 },
    ...overrides,
  };
}

async function stubPanel(
  page: import("@playwright/test").Page,
  queries: string[] = [],
  overrideForPage2 = false,
) {
  await page.route("**/api/oficinas/estadisticas*", async (route) => {
    const url = new URL(route.request().url());
    queries.push(`${url.pathname}?${url.searchParams.toString()}`);
    const pageParam = url.searchParams.get("page");
    const body =
      overrideForPage2 && pageParam === "2"
        ? panelFixture({
            ranking: {
              rows: [
                {
                  code: "ZZZZ",
                  name: "Oficina Zeta",
                  provincia: "Córdoba",
                  region: "Centro",
                  usuarios: 5,
                  incidentes: 0,
                  eventos: 0,
                  terminales: 1,
                  activa: false,
                },
              ],
              total: 30,
              page: 2,
              pageSize: 25,
            },
          })
        : panelFixture();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.beforeAll(async () => {
  // Cleanup previo idempotente: si un run anterior murió antes del afterAll,
  // estos códigos/usuarios ya existen y el insert falla por UNIQUE.
  await db.delete(terminals).where(inArray(terminals.nis, [officeCode, closedOfficeCode]));
  await db.delete(employeeOffices).where(eq(employeeOffices.sucursal, officeCode));
  await db.delete(offices).where(inArray(offices.code, [officeCode, closedOfficeCode, accentOfficeCode]));
  const staleUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.username, [`agent_of_${stamp}`, `sup_of_${stamp}`]));
  if (staleUsers.length > 0) {
    const ids = staleUsers.map((u) => u.id);
    await db.delete(sessions).where(inArray(sessions.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }

  const [agentRow] = await db
    .insert(users)
    .values({ username: `agent_of_${stamp}`, password: "x", role: "agent" })
    .returning({ id: users.id });
  agentId = agentRow.id;
  const [supervisorRow] = await db
    .insert(users)
    .values({ username: `sup_of_${stamp}`, password: "x", role: "supervisor" })
    .returning({ id: users.id });
  supervisorId = supervisorRow.id;
  await db.insert(sessions).values([
    { id: agentSessionId, userId: agentId, expiresAt: Date.now() + 86400000 },
    { id: supervisorSessionId, userId: supervisorId, expiresAt: Date.now() + 86400000 },
  ]);

  let [province] = await db.select({ code: provinces.code }).from(provinces).limit(1);
  if (!province) {
    await db.insert(provinces).values({ code: "B", name: "Buenos Aires" });
    province = { code: "B" };
  }

  const [office] = await db
    .insert(offices)
    .values({
      code: officeCode,
      name: "Sucursal E2E",
      type: "sucursal",
      provinceCode: province.code,
      officeType: "Sucursal",
      locality: "La Plata",
      active: true,
    })
    .returning({ id: offices.id });
  officeId = office.id;

  await db.insert(officeInvgateLinks).values({
    officeId: office.id,
    invgateLocationId: 990000 + (stamp % 10000),
    invgateUserTotal: 12,
  });
  await db.insert(terminals).values({ hostname: `E2E-${stamp}`, nis: officeCode });
  await db.insert(employeeOffices).values({ username: `e2e_of_${stamp}`, sucursal: officeCode });

  const [closedOffice] = await db
    .insert(offices)
    .values({
      code: closedOfficeCode,
      name: "Sucursal Cerrada E2E",
      type: "sucursal",
      provinceCode: province.code,
      officeType: "Sucursal",
      locality: "La Plata",
      active: false,
    })
    .returning({ id: offices.id });
  closedOfficeId = closedOffice.id;
  await db.insert(terminals).values([
    { hostname: `E2E-C1-${stamp}`, nis: closedOfficeCode },
    { hostname: `E2E-C2-${stamp}`, nis: closedOfficeCode },
  ]);

  const [accentOffice] = await db
    .insert(offices)
    .values({
      code: accentOfficeCode,
      name: `Oficina Córdoba ${stamp}`,
      type: "sucursal",
      provinceCode: province.code,
      officeType: "Sucursal",
      locality: "Córdoba",
      active: true,
    })
    .returning({ id: offices.id });
  accentOfficeId = accentOffice.id;
});

test.afterAll(async () => {
  await db.delete(employeeOffices).where(eq(employeeOffices.sucursal, officeCode));
  await db.delete(terminals).where(eq(terminals.nis, officeCode));
  await db.delete(officeInvgateLinks).where(eq(officeInvgateLinks.officeId, officeId));
  await db.delete(offices).where(eq(offices.id, officeId));
  await db.delete(terminals).where(eq(terminals.nis, closedOfficeCode));
  await db.delete(offices).where(eq(offices.id, closedOfficeId));
  await db.delete(offices).where(eq(offices.id, accentOfficeId));
  await db.delete(sessions).where(inArray(sessions.userId, [agentId, supervisorId]));
  await db.delete(users).where(inArray(users.id, [agentId, supervisorId]));
});

test.describe("API de estadísticas de oficinas", () => {
  test("sin sesión responde 401", async ({ request }) => {
    const response = await request.get("/api/oficinas/estadisticas");
    expect(response.status()).toBe(401);
  });

  test("un agente recibe 403", async ({ request }) => {
    const response = await request.get("/api/oficinas/estadisticas", {
      headers: { cookie: `session_id=${sign(agentSessionId)}` },
    });
    expect(response.status()).toBe(403);
  });

  test("un supervisor recibe el contrato completo", async ({ request }) => {
    const response = await request.get("/api/oficinas/estadisticas?pageSize=5", {
      headers: { cookie: `session_id=${sign(supervisorSessionId)}` },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.period).toBe("last30d");
    expect(body.kpis).toMatchObject({
      oficinasActivas: expect.any(Number),
      oficinasTotal: expect.any(Number),
      terminales: expect.any(Number),
    });
    expect(body.charts.porProvincia.labels.length).toBe(
      body.charts.porProvincia.series[0].data.length,
    );
    expect(body.charts.modernizacion.series.map((s: { label: string }) => s.label)).toEqual([
      "Cerrados",
      "En curso",
    ]);
    expect(body.ranking.rows.length).toBeLessThanOrEqual(5);
    expect(body.ranking.pageSize).toBe(5);
    expect(typeof body.meta.invgateOk).toBe("boolean");
    expect(body.meta.massEventMinOffices).toBeGreaterThan(0);
    expect(Array.isArray(body.filtros.provincias)).toBe(true);
  });

  test("parámetros inválidos responden 400", async ({ request }) => {
    const headers = { cookie: `session_id=${sign(supervisorSessionId)}` };
    for (const query of ["page=0", "page=abc", "orderBy=nope", "dir=sideways", "pageSize=9999"]) {
      const response = await request.get(`/api/oficinas/estadisticas?${query}`, { headers });
      expect(response.status(), query).toBe(400);
    }
  });

  test("la búsqueda de oficinas ignora acentos", async ({ request }) => {
    const headers = { cookie: `session_id=${sign(supervisorSessionId)}` };
    const codes: string[] = [];
    for (const q of [`cordoba ${stamp}`, `Córdoba ${stamp}`, `CÓRDOBA ${stamp}`]) {
      const response = await request.get(
        `/api/oficinas/estadisticas?pageSize=100&q=${encodeURIComponent(q)}`,
        { headers },
      );
      expect(response.status(), q).toBe(200);
      const body = await response.json();
      const row = body.ranking.rows.find(
        (r: { code: string }) => r.code === accentOfficeCode,
      );
      expect(row, q).toBeTruthy();
      codes.push(row.code);
    }
    expect(codes).toEqual([accentOfficeCode, accentOfficeCode, accentOfficeCode]);
  });

  test("el KPI de terminales comparte semántica con el ranking (parque total)", async ({
    request,
  }) => {
    const response = await request.get("/api/oficinas/estadisticas?pageSize=100", {
      headers: { cookie: `session_id=${sign(supervisorSessionId)}` },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();

    const counted = await db
      .select({ nis: terminals.nis, total: sql<number>`count(*)` })
      .from(terminals)
      .groupBy(terminals.nis);
    const terminalByCode = new Map(counted.map((r) => [r.nis, Number(r.total)]));
    expect(terminalByCode.get(closedOfficeCode)).toBe(2);

    const allOffices = await db.select({ code: offices.code }).from(offices);
    const expected = allOffices.reduce(
      (sum, o) => sum + (terminalByCode.get(o.code) ?? 0),
      0,
    );

    expect(body.kpis.terminales).toBe(expected);
  });

  test("un agente no puede ver la página (redirige al inicio)", async ({ page }) => {
    await page.context().addCookies([
      { name: "session_id", value: sign(agentSessionId), domain: "localhost", path: "/" },
    ]);
    const base = (test.info().project.use.baseURL ?? "").replace(/\/$/, "");
    await page.goto("/oficinas/estadisticas");
    // El middleware redirige con toast a la home; el portal normaliza la URL
    // final sin query, así que se verifica el destino y no el mensaje.
    expect(page.url()).not.toContain("/oficinas/estadisticas");
    expect(page.url().startsWith(base)).toBe(true);
  });
});

test.describe("Vista del panel con API stubbeada", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "session_id", value: sign(supervisorSessionId), domain: "localhost", path: "/" },
    ]);
  });

  test("renderiza KPIs, eventos masivos y ranking; ordena y pagina", async ({ page }) => {
    const queries: string[] = [];
    await stubPanel(page, queries, true);

    await page.goto("/oficinas/estadisticas");

    await expect(page.locator('[data-kpi="usuarios"] [data-kpi-value]')).toHaveText("120");
    await expect(page.locator('[data-kpi="incidentes"] [data-kpi-value]')).toHaveText("7");
    await expect(page.locator('[data-kpi="eventos"] [data-kpi-value]')).toHaveText("1");

    const massCard = page.locator("[data-mass-events-card]");
    await expect(massCard).toBeVisible();
    await expect(massCard).toContainText("6 oficinas");
    await expect(massCard).toContainText("STS - Desconexión de agentes");

    const rows = page.locator("#ranking-table [data-table-row]");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(officeCode);

    // El ranking usa la DataTable del sistema: header institucional + sort keys.
    const header = page.locator("#ranking-table [data-table-header]");
    await expect(header).toBeVisible();
    await expect(header).toHaveClass(/bg-secondary/);

    await page.locator('#ranking-table [data-table-sort-key="usuarios"]').click();
    await expect
      .poll(() => queries.some((q) => q.includes("orderBy=usuarios") && q.includes("dir=asc")))
      .toBe(true);

    await page.locator("[data-page-next]").click();
    await expect(rows.first()).toContainText("Oficina Zeta");
    await expect(page.locator("[data-page-label]")).toHaveText("2 / 2");

    await page.locator("#stats-provincia").selectOption("Córdoba");
    await expect.poll(() => queries.some((q) => q.includes("provincia=C"))).toBe(true);
  });

  test("el ranking usa la DataTable del sistema (header institucional y estado vacío)", async ({
    page,
  }) => {
    await page.route("**/api/oficinas/estadisticas*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          panelFixture({
            ranking: { rows: [], total: 0, page: 1, pageSize: 25 },
            eventosMasivos: [],
          }),
        ),
      });
    });
    await page.goto("/oficinas/estadisticas");

    // Con 0 filas, la DataTable esconde la tabla y muestra su empty state.
    await expect(page.locator("#ranking-table-empty-state")).toBeVisible();
    await expect(page.locator("#ranking-table [data-table-wrapper]")).toBeHidden();
    await expect(page.locator("#ranking-table-empty-state-desc")).toContainText(
      "No hay oficinas para los filtros seleccionados",
    );
  });

  test("la fila del ranking navega al detalle", async ({ page }) => {
    await stubPanel(page);
    await page.goto("/oficinas/estadisticas");
    const firstRow = page.locator("#ranking-table [data-table-row]").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page).toHaveURL(new RegExp(`/oficinas/estadisticas/${officeCode}$`));
  });

  test("InvGate caído: badge visible y KPIs sin datos en vivo, panel intacto", async ({
    page,
  }) => {
    await page.route("**/api/oficinas/estadisticas*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          panelFixture({
            kpis: {
              oficinasActivas: 2,
              oficinasTotal: 3,
              usuarios: 120,
              terminales: 40,
              incidentesAbiertos: null,
              eventosMasivosActivos: null,
            },
            eventosMasivos: [],
            meta: { invgateOk: false, snapshotAt: new Date().toISOString(), massEventMinOffices: 5 },
          }),
        ),
      });
    });

    await page.goto("/oficinas/estadisticas");
    await expect(page.locator("[data-invgate-badge]")).toBeVisible();
    await expect(page.locator('[data-kpi="incidentes"] [data-kpi-value]')).toHaveText("—");
    await expect(page.locator('[data-kpi="eventos"] [data-kpi-value]')).toHaveText("—");
    await expect(page.locator('[data-kpi="usuarios"] [data-kpi-value]')).toHaveText("120");
    await expect(page.locator("[data-mass-events-card]")).toBeHidden();
    await expect(page.locator("#ranking-table [data-table-row]")).toHaveCount(2);
  });

  test("sin eventos masivos la card ámbar no aparece", async ({ page }) => {
    await page.route("**/api/oficinas/estadisticas*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(panelFixture({ eventosMasivos: [] })),
      });
    });
    await page.goto("/oficinas/estadisticas");
    await expect(page.locator('[data-kpi="terminales"] [data-kpi-value]')).toHaveText("40");
    await expect(page.locator("[data-mass-events-card]")).toBeHidden();
  });
});

test.describe("Detalle por oficina", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "session_id", value: sign(supervisorSessionId), domain: "localhost", path: "/" },
    ]);
  });

  test("muestra los datos locales de la oficina", async ({ page }) => {
    await page.goto(`/oficinas/estadisticas/${officeCode}`);
    await expect(page.getByRole("heading", { name: "Sucursal E2E" })).toBeVisible();
    await expect(page.locator('[data-kpi="terminales"] [data-kpi-value]')).toHaveText("1");
    await expect(page.locator('[data-kpi="personal"] [data-kpi-value]')).toHaveText("1");
  });

  test("un código inexistente responde 404", async ({ page }) => {
    const response = await page.goto("/oficinas/estadisticas/NOEXISTE-999");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Oficina no encontrada" })).toBeVisible();
  });
});

test.describe("Acceso a estadísticas desde el directorio", () => {
  test("un supervisor ve el CTA y navega a la sección", async ({ page }) => {
    await page.context().addCookies([
      { name: "session_id", value: sign(supervisorSessionId), domain: "localhost", path: "/" },
    ]);
    await page.goto("/oficinas");
    // El directorio llega por server island: primero el form de filtros, para
    // que un count 0 no sea un falso verde en el caso del agente.
    await expect(page.locator("#office-filters-form")).toBeVisible({ timeout: 20000 });

    const cta = page.locator("[data-cta-estadisticas-oficinas]");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/oficinas\/estadisticas$/);

    await cta.click();
    await expect(page).toHaveURL(/\/oficinas\/estadisticas$/);
    await expect(
      page.getByRole("heading", { name: "Estadísticas de oficinas" }),
    ).toBeVisible();
  });

  test("el listado de oficinas muestra el banner de accesos rápidos", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: "session_id", value: sign(supervisorSessionId), domain: "localhost", path: "/" },
    ]);
    await page.goto("/oficinas");
    await expect(page.locator("#office-filters-form")).toBeVisible({ timeout: 20000 });

    await expect(page.locator("[data-cta-estructura-oficinas]")).toBeVisible();
    await expect(page.locator("[data-cta-estadisticas-oficinas]")).toBeVisible();
  });

  test("un agente no ve el CTA", async ({ page }) => {
    await page.context().addCookies([
      { name: "session_id", value: sign(agentSessionId), domain: "localhost", path: "/" },
    ]);
    await page.goto("/oficinas");
    await expect(page.locator("#office-filters-form")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("[data-cta-estadisticas-oficinas]")).toHaveCount(0);
  });
});
