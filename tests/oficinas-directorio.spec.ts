import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import { offices, provinces, sessions, users } from "../src/db/schema";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

const stamp = Date.now();
const zone = `ZONA-E2E-${stamp}`;
const openCode = `D${String(stamp).slice(-6)}`;
const closedCode = `X${String(stamp).slice(-6)}`;
const adminSessionId = `sess_dir_admin_${stamp}`;
const agentSessionId = `sess_dir_agent_${stamp}`;

let adminId = 0;
let agentId = 0;
let openOfficeId = 0;
let closedOfficeId = 0;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const [province] = await db
    .select({ code: provinces.code })
    .from(provinces)
    .limit(1);
  let provinceCode = province?.code;
  if (!provinceCode) {
    provinceCode = "B";
    await db.insert(provinces).values({ code: "B", name: "Buenos Aires" });
  }

  const [admin] = await db
    .insert(users)
    .values({
      username: `dir_admin_${stamp}`,
      password: "x",
      role: "admin",
    })
    .returning({ id: users.id });
  adminId = admin.id;

  const [agent] = await db
    .insert(users)
    .values({
      username: `dir_agent_${stamp}`,
      password: "x",
      role: "agent",
    })
    .returning({ id: users.id });
  agentId = agent.id;

  await db.insert(sessions).values([
    { id: adminSessionId, userId: adminId, expiresAt: Date.now() + 86400000 },
    { id: agentSessionId, userId: agentId, expiresAt: Date.now() + 86400000 },
  ]);

  const [openOffice] = await db
    .insert(offices)
    .values({
      code: openCode,
      name: `CDD E2E ${stamp}`,
      type: "CDD",
      provinceCode,
      locality: "La Plata",
      zone,
      searchableText: `cdd e2e ${stamp} la plata ${zone}`,
      active: true,
    })
    .returning({ id: offices.id });
  openOfficeId = openOffice.id;

  const [closedOffice] = await db
    .insert(offices)
    .values({
      code: closedCode,
      name: `CDD Cerrada E2E ${stamp}`,
      type: "CDD",
      provinceCode,
      locality: "La Plata",
      zone,
      searchableText: `cdd cerrada e2e ${stamp} la plata ${zone}`,
      active: false,
    })
    .returning({ id: offices.id });
  closedOfficeId = closedOffice.id;
});

test.afterAll(async () => {
  await db.delete(offices).where(inArray(offices.id, [openOfficeId, closedOfficeId]));
  await db
    .delete(sessions)
    .where(inArray(sessions.userId, [adminId, agentId]));
  await db.delete(users).where(inArray(users.id, [adminId, agentId]));
});

async function login(
  context: import("@playwright/test").BrowserContext,
  sessionId: string,
) {
  const cookie = sign(sessionId);
  await context.addCookies([
    {
      name: "session_id",
      value: cookie,
      domain: "localhost",
      path: "/",
    },
    {
      name: "mda_session",
      value: cookie,
      domain: "localhost",
      path: "/",
    },
  ]);
}

test("admin ve KPI, filtros visibles y menú de acciones completo", async ({
  context,
  page,
}) => {
  await login(context, adminSessionId);
  await page.goto("/oficinas");

  await expect(page.getByText("Padrón", { exact: true })).toBeVisible();
  await expect(page.getByText("Oficinas totales")).toBeVisible();
  await expect(page.locator("#typeFilter")).toBeVisible();
  await expect(page.locator("#regionFilter")).toBeVisible();
  await expect(page.locator("#provinceFilter")).toBeVisible();
  await expect(page.locator('input[name="isHeadquarter"]')).toBeVisible();
  await expect(page.getByText("Avanzados", { exact: true })).toBeVisible();

  const actionsTrigger = page.locator(
    'summary[aria-label="Más acciones del directorio"]',
  );
  await expect(actionsTrigger).toHaveCount(1);
  await actionsTrigger.click();
  const menu = actionsTrigger
    .locator("xpath=ancestor::details[1]")
    .locator(".dropdown-content");
  await expect(menu).toBeVisible();
  for (const label of [
    "Exportar CSV",
    "Registrar oficina",
    "Sincronizar ahora",
    "Estructura",
    "Estadísticas",
    "Comparativa InvGate",
  ]) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await test.info().attach("directorio-admin", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await test.info().attach("directorio-admin-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("búsqueda persiste al recargar y se combina con el select de tipo", async ({
  context,
  page,
}) => {
  await login(context, adminSessionId);
  await page.goto("/oficinas");

  const search = page.locator("#office-search");
  await search.fill(`CDD E2E ${stamp}`);
  await page.waitForURL(/search=CDD\+E2E\+/);

  await page.locator("#typeFilter").selectOption("CDD");
  await page.waitForURL(/type=CDD/);
  await expect(
    page.getByText(`CDD E2E ${stamp}`, { exact: true }).first(),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("#office-search")).toHaveValue(`CDD E2E ${stamp}`);
  await expect(page.locator("#typeFilter")).toHaveValue("CDD");
});

test("filtro avanzado de zona actualiza badge y limpiar lo revierte", async ({
  context,
  page,
}) => {
  await login(context, adminSessionId);
  await page.goto("/oficinas");

  await page.getByText("Avanzados", { exact: true }).click();
  await page.locator("#zoneFilter").selectOption(zone);
  await page.waitForURL(/zone=ZONA-E2E-/);

  const badge = page.locator("#advanced-filter-count");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("1");

  await page.getByRole("button", { name: "Limpiar todos los filtros" }).click();
  await expect(badge).toBeHidden();
  await expect(page).not.toHaveURL(/zone=/);
  await expect(page.locator("#zoneFilter")).toHaveValue("all");
});

test("agente no ve el menú de acciones y conserva los filtros", async ({
  context,
  page,
}) => {
  await login(context, agentSessionId);
  await page.goto("/oficinas");

  await expect(page.locator("#typeFilter")).toBeVisible();
  await expect(page.getByText("Avanzados", { exact: true })).toBeVisible();
  await expect(
    page.locator('summary[aria-label="Más acciones del directorio"]'),
  ).toHaveCount(0);
});
