import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { mesas, sessions, users } from "../../src/db/schema";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

test.describe("Endpoint de estadísticas de usuarios (#183)", () => {
  const stamp = Date.now();
  const sessionId = `sess_stats_${stamp}`;
  const username = `admin_stats_${stamp}`;
  let adminId = 0;
  let cookie = "";

  test.beforeAll(async () => {
    const [row] = await db
      .insert(users)
      .values({ username, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = row.id;
    await db.insert(sessions).values({
      id: sessionId,
      userId: adminId,
      expiresAt: Date.now() + 86_400_000,
    });
    cookie = sign(sessionId);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.userId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  test("sin sesión responde 401", async ({ request }) => {
    const response = await request.get("/api/admin/usuarios/estadisticas");
    expect(response.status()).toBe(401);
  });

  test("con sesión admin devuelve KPIs y las tres series", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/admin/usuarios/estadisticas?activo=true",
      { headers: { cookie: `session_id=${cookie}` } },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.kpis).toMatchObject({
      total: expect.any(Number),
      activos: expect.any(Number),
      inactivos: expect.any(Number),
      enAsistencia: expect.any(Number),
    });
    expect(body.charts.estado.labels).toEqual(["Activos", "Inactivos"]);
    expect(body.charts.estado.series[0].data).toHaveLength(2);
    expect(body.charts.porRol.labels).toContain("admin");
    expect(body.charts.porRol.series[0].data).toHaveLength(
      body.charts.porRol.labels.length,
    );
    expect(body.charts.porMesa.labels).not.toContain("Sin mesa");
    expect(body.charts.porMesa.series[0].data).toHaveLength(
      body.charts.porMesa.labels.length,
    );
    expect(Array.isArray(body.filtros.mesas)).toBe(true);
    expect(body.filtros.roles).toContain("admin");
  });

  test("rechaza parámetros inválidos con 400", async ({ request }) => {
    const response = await request.get(
      "/api/admin/usuarios/estadisticas?activo=quizas",
      { headers: { cookie: `session_id=${cookie}` } },
    );
    expect(response.status()).toBe(400);
  });

  test("rechaza rol inválido con 400", async ({ request }) => {
    const response = await request.get(
      "/api/admin/usuarios/estadisticas?rol=nope",
      { headers: { cookie: `session_id=${cookie}` } },
    );
    expect(response.status()).toBe(400);
  });

  test("rechaza mesa no numérica con 400", async ({ request }) => {
    const response = await request.get(
      "/api/admin/usuarios/estadisticas?mesa=abc",
      { headers: { cookie: `session_id=${cookie}` } },
    );
    expect(response.status()).toBe(400);
  });

  test("filtros.mesas sólo incluye mesas asignables (o la mesa MDA TI)", async ({
    request,
  }) => {
    const stampMesa = Date.now();
    const asignableId = 920000 + (stampMesa % 50000);
    const noAsignableId = 970000 + (stampMesa % 50000);
    const asignableNombre = `E2E Mesa Asignable API ${stampMesa}`;
    const noAsignableNombre = `E2E Mesa No Asignable API ${stampMesa}`;

    await db.insert(mesas).values([
      {
        invgateId: asignableId,
        name: asignableNombre,
        active: true,
        assignable: true,
        lastSyncedAt: "2026-10-10",
      },
      {
        invgateId: noAsignableId,
        name: noAsignableNombre,
        active: true,
        assignable: false,
        lastSyncedAt: "2026-10-10",
      },
    ]);

    try {
      const response = await request.get("/api/admin/usuarios/estadisticas", {
        headers: { cookie: `session_id=${cookie}` },
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      const nombres: string[] = body.filtros.mesas.map((m: any) => m.name);
      expect(nombres).toContain(asignableNombre);
      expect(nombres).not.toContain(noAsignableNombre);
    } finally {
      await db
        .delete(mesas)
        .where(inArray(mesas.invgateId, [asignableId, noAsignableId]));
    }
  });
});

test.describe("Export CSV de estadísticas de usuarios (#183)", () => {
  const stamp = Date.now();
  const sessionId = `sess_stats_csv_${stamp}`;
  const username = `admin_stats_csv_${stamp}`;
  const mesaFormulaId = 900002 + (stamp % 100000);
  const mesaFormulaNombre = `=cmd|'/c calc'!A1 ${stamp}`;
  const usuarioFormula = `e2e_formula_csv_${stamp}`;
  let adminId = 0;
  let cookie = "";

  test.beforeAll(async () => {
    const [row] = await db
      .insert(users)
      .values({ username, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = row.id;
    await db.insert(sessions).values({
      id: sessionId,
      userId: adminId,
      expiresAt: Date.now() + 86_400_000,
    });
    cookie = sign(sessionId);
    await db.insert(mesas).values({
      invgateId: mesaFormulaId,
      name: mesaFormulaNombre,
      active: true,
      assignable: true,
      lastSyncedAt: "2026-10-10",
    });
    await db.insert(users).values({
      username: usuarioFormula,
      password: "x",
      role: "agent",
      helpdeskId: mesaFormulaId,
    });
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.userId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.username, usuarioFormula));
    await db.delete(mesas).where(eq(mesas.invgateId, mesaFormulaId));
  });

  test("sin sesión responde 401", async ({ request }) => {
    const response = await request.get("/api/export/usuarios-estadisticas");
    expect(response.status()).toBe(401);
  });

  test("con sesión admin devuelve CSV seccionado con los mismos filtros", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/export/usuarios-estadisticas?activo=true",
      { headers: { cookie: `session_id=${cookie}` } },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("attachment");
    const body = await response.text();
    // generateCsv antepone BOM (\uFEFF): se compara el contenido sin él.
    expect(body.replace(/^\uFEFF/, "")).toMatch(
      /^seccion;dimension;valor\r\n/,
    );
    expect(body).toContain("kpis;total;");
    expect(body).toContain("porRol;admin;");
    // El filtro activo=true deja los inactivos en cero.
    expect(body).toContain("estado;Inactivos;0");
  });

  test("rechaza parámetros inválidos con 400", async ({ request }) => {
    const response = await request.get(
      "/api/export/usuarios-estadisticas?activo=quizas",
      { headers: { cookie: `session_id=${cookie}` } },
    );
    expect(response.status()).toBe(400);
  });

  test("neutraliza inyección de fórmulas en los labels del CSV", async ({
    request,
  }) => {
    const response = await request.get("/api/export/usuarios-estadisticas", {
      headers: { cookie: `session_id=${cookie}` },
    });
    expect(response.status()).toBe(200);
    const body = await response.text();
    // El label llega como label de sección (porMesa) y debe salir prefijado
    // con comilla simple para que la planilla no lo evalúe como fórmula.
    expect(body).toContain(`porMesa;'${mesaFormulaNombre};1`);
  });
});

test.describe("Vista de estadísticas de usuarios (#183)", () => {
  const stamp = Date.now();
  const sessionId = `sess_stats_view_${stamp}`;
  const username = `admin_stats_view_${stamp}`;
  const mesaAsignableId = 900000 + (stamp % 100000);
  const mesaPruebaId = 900001 + (stamp % 100000);
  let adminId = 0;
  let cookie = "";

  test.beforeAll(async () => {
    const [row] = await db
      .insert(users)
      .values({ username, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = row.id;
    await db.insert(sessions).values({
      id: sessionId,
      userId: adminId,
      expiresAt: Date.now() + 86_400_000,
    });
    cookie = sign(sessionId);
    const [mesaAsignable] = await db
      .insert(mesas)
      .values({
        invgateId: mesaAsignableId,
        name: `Mesa E2E Asignable ${stamp}`,
        active: true,
        assignable: true,
        lastSyncedAt: "2026-10-10",
      })
      .returning({ id: mesas.invgateId });
    const [mesaPrueba] = await db
      .insert(mesas)
      .values({
        invgateId: mesaPruebaId,
        name: `Mesa E2E Prueba ${stamp}`,
        active: true,
        assignable: false,
        lastSyncedAt: "2026-10-10",
      })
      .returning({ id: mesas.invgateId });
    await db.insert(users).values([
      {
        username: `e2e_asignable_${stamp}`,
        password: "x",
        role: "agent",
        helpdeskId: mesaAsignable.id,
      },
      {
        username: `e2e_prueba_${stamp}`,
        password: "x",
        role: "agent",
        helpdeskId: mesaPrueba.id,
      },
      { username: `e2e_sinmesa_${stamp}`, password: "x", role: "agent" },
    ]);
  });

  test.afterAll(async () => {
    await db
      .delete(users)
      .where(
        inArray(users.username, [
          `e2e_asignable_${stamp}`,
          `e2e_prueba_${stamp}`,
          `e2e_sinmesa_${stamp}`,
        ]),
      );
    await db
      .delete(mesas)
      .where(inArray(mesas.invgateId, [mesaAsignableId, mesaPruebaId]));
    await db.delete(sessions).where(eq(sessions.userId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: "session_id", value: cookie, domain: "localhost", path: "/" },
    ]);
  });

  test("renderiza KPIs, gráficos y no pide Chart.js por CDN", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("cdn.jsdelivr.net")) {
        externalRequests.push(request.url());
      }
    });

    await page.goto("/admin/usuarios/estadisticas");
    await expect(
      page.getByRole("heading", { name: "Estadísticas de usuarios" }),
    ).toBeVisible();

    await expect(page.locator('[data-chart-card] canvas')).toHaveCount(3);
    await expect(page.locator('[data-chart-empty]').first()).toBeHidden();

    await expect(
      page.locator('[data-kpi="total"] [data-kpi-value]'),
    ).not.toHaveText("…");
    await expect(
      page.locator('[data-kpi="activos"] [data-kpi-value]'),
    ).not.toHaveText("…");

    const estadoCard = page
      .locator("[data-chart-card]")
      .filter({ has: page.getByRole("heading", { name: "Activos vs inactivos" }) });
    await estadoCard.locator("[data-table-toggle]").click();
    await expect(
      estadoCard.locator('td[data-label="Activos"]'),
    ).not.toHaveText("0");

    await expect(estadoCard.locator("canvas")).toBeHidden();
    await expect(
      estadoCard.locator('[data-chart-table] td[data-label="Activos"]'),
    ).toBeVisible();

    await estadoCard.locator("[data-table-toggle]").click();
    await expect(estadoCard.locator("canvas")).toBeVisible();
    await expect(estadoCard.locator("[data-chart-table]")).toBeHidden();

    expect(externalRequests).toEqual([]);
  });

  test("el filtro por rol actualiza la URL y los datos del gráfico", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios/estadisticas");
    const porRolCard = page
      .locator("[data-chart-card]")
      .filter({ has: page.getByRole("heading", { name: "Usuarios por rol" }) });
    await porRolCard.locator("[data-table-toggle]").click();
    await expect(
      porRolCard.locator('td[data-label="admin"]'),
    ).toBeVisible();

    await page.locator("#stats-rol").selectOption("agent");
    await expect(page).toHaveURL(/rol=agent/);

    await expect(porRolCard.locator("td[data-label='agent']")).toBeVisible();
    await expect(porRolCard.locator("td[data-label='admin']")).toHaveCount(0);
  });

  test("los filtros usan SelectField con su legend accesible", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios/estadisticas");
    for (const [id, label] of [
      ["stats-rol", "Rol"],
      ["stats-mesa", "Mesa"],
      ["stats-activo", "Estado"],
    ] as const) {
      const field = page
        .locator("fieldset")
        .filter({ has: page.locator(`#${id}`) });
      await expect(field.locator("legend")).toHaveText(label);
    }
  });

  test("el filtro por rol se inicializa desde la query de la URL", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios/estadisticas?rol=agent");
    await expect(page.locator("#stats-rol")).toHaveValue("agent");

    const porRolCard = page
      .locator("[data-chart-card]")
      .filter({ has: page.getByRole("heading", { name: "Usuarios por rol" }) });
    await porRolCard.locator("[data-table-toggle]").click();
    await expect(
      porRolCard.locator("td[data-label='agent']"),
    ).toBeVisible();
    await expect(
      porRolCard.locator("td[data-label='admin']"),
    ).toHaveCount(0);
  });

  test("el CTA vive en la fila de botones y lleva a las estadísticas", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios");
    const fila = page
      .locator("div.flex.flex-wrap.items-center.gap-3")
      .filter({ has: page.getByRole("button", { name: /tabla comparativa/ }) });
    await expect(fila.locator("[data-cta-estadisticas]")).toBeVisible();
    await page.locator("[data-cta-estadisticas]").click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/estadisticas$/);
    await expect(
      page.getByRole("heading", { name: "Estadísticas de usuarios" }),
    ).toBeVisible();
  });

  test("el listado de usuarios muestra la franja de KPIs al inicio", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios");
    const dash = page.locator("[data-section-dashboard]");
    await expect(dash).toBeVisible();
    await expect(dash.locator(".stat-value")).toHaveCount(4);
  });

  test("el botón volver del header regresa a la gestión de usuarios", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios/estadisticas");
    await page
      .locator("header")
      .getByRole("link", { name: "Volver a Gestión de usuarios" })
      .click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
  });

  test("usuarios por mesa excluye mesas no asignables y ocupa el ancho", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios/estadisticas");
    const porMesaCard = page
      .locator("[data-chart-card]")
      .filter({
        has: page.getByRole("heading", { name: "Usuarios por mesa" }),
      });
    await porMesaCard.locator("[data-table-toggle]").click();

    const asignable = porMesaCard.locator(
      `[data-chart-table] td[data-label="Mesa E2E Asignable ${stamp}"]`,
    );
    await expect(asignable).toHaveCount(1);
    const prueba = porMesaCard.locator(
      `[data-chart-table] td[data-label="Mesa E2E Prueba ${stamp}"]`,
    );
    await expect(prueba).toHaveCount(0);
    await expect(
      porMesaCard.locator('[data-chart-table] td[data-label="Sin mesa"]'),
    ).toHaveCount(0);

    const ocupaAncho = await porMesaCard.evaluate((el) => {
      const grid = el.parentElement;
      if (!grid) return false;
      return (
        el.getBoundingClientRect().width >=
        grid.getBoundingClientRect().width - 1
      );
    });
    expect(ocupaAncho).toBe(true);
  });

  test("el botón de export refleja los filtros activos", async ({ page }) => {
    await page.goto("/admin/usuarios/estadisticas");
    const exportBtn = page.locator("#stats-export");
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toHaveAttribute(
      "href",
      /api\/export\/usuarios-estadisticas$/,
    );

    await page.locator("#stats-rol").selectOption("agent");
    await expect(exportBtn).toHaveAttribute("href", /rol=agent/);
  });

  test("el export descarga un CSV con el dataset filtrado", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios/estadisticas?activo=true");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#stats-export").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^usuarios-estadisticas_\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const path = await download.path();
    const content = await readFileSync(path, "utf8");
    expect(content.replace(/^\uFEFF/, "")).toContain(
      "seccion;dimension;valor",
    );
    expect(content).toContain("kpis;total;");
    expect(content).toContain("estado;Inactivos;0");
  });
});
