import "dotenv/config";
import { expect, test } from "@playwright/test";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

let admin: TestUser;
let teamLeader: TestUser;

test.beforeAll(async () => {
  admin = await createTestUserAndSession("admin", {
    helpdeskName: "TI_GSM_MDA TI",
  });
  teamLeader = await createTestUserAndSession("team_leader", {
    helpdeskName: "TI_GSM_MDA TI",
  });
});

test.afterAll(async () => {
  await cleanupTestUser(admin.userId, admin.sessionId);
  await cleanupTestUser(teamLeader.userId, teamLeader.sessionId);
});

test("el admin ve el acceso a documentación en /admin", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  await page.goto("/admin");

  await expect(
    page.getByRole("link", { name: /Documentación técnica/i }),
  ).toBeVisible();
});

test("el admin ve el índice con las tres secciones", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);

  const response = await page.goto("/admin/documentacion");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { name: "Documentación técnica" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Arquitectura", level: 2, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Migración", level: 2, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Decisiones (ADR)",
      level: 2,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Guía de lectura/i }),
  ).toBeVisible();
});

test("el buscador filtra los documentos", async ({ page, context }) => {
  await setSessionCookie(context, admin.signedSessionId);
  await page.goto("/admin");

  await page.getByRole("link", { name: /Documentación técnica/i }).click();
  await page.waitForURL(/\/admin\/documentacion\/?$/);
  await expect(
    page.getByRole("heading", { name: "Documentación técnica" }),
  ).toBeVisible();

  await page.locator("#doc-search").fill("deuda");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.waitForURL(/q=deuda/);

  await expect(
    page.getByRole("link", { name: /Registro de deuda técnica/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Guía de lectura/i }),
  ).toHaveCount(0);
});

test("el admin abre un documento con tablas", async ({ page, context }) => {
  await setSessionCookie(context, admin.signedSessionId);

  const response = await page.goto(
    "/admin/documentacion/architecture/03-deuda-tecnica",
  );
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Registro de deuda técnica/i,
    }),
  ).toBeVisible();
  await expect(page.locator(".doc-article-body table").first()).toBeVisible();
  await expect(
    page.getByText("docs/architecture/03-deuda-tecnica.md"),
  ).toBeVisible();
});

test("los links entre documentos navegan dentro del portal", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  await page.goto("/admin/documentacion/architecture/README");

  const link = page.getByRole("link", {
    name: "../migration/00-roadmap.md",
  });
  await expect(link).toBeVisible();

  await link.click();
  await page.waitForURL(/\/admin\/documentacion\/migration\/00-roadmap/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Roadmap de reconstrucción/i }),
  ).toBeVisible();
});

test("un documento inexistente responde 404", async ({ page, context }) => {
  await setSessionCookie(context, admin.signedSessionId);

  const response = await page.goto(
    "/admin/documentacion/architecture/no-existe",
  );
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Documento no encontrado" }),
  ).toBeVisible();
});

test("un team_leader no ve la tarjeta en /admin", async ({ page, context }) => {
  await setSessionCookie(context, teamLeader.signedSessionId);
  await page.goto("/admin");

  await expect(
    page.getByRole("link", { name: /Documentación técnica/i }),
  ).toHaveCount(0);
});

test("un team_leader no accede a la documentación", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, teamLeader.signedSessionId);

  await page.goto("/admin/documentacion");
  await page.waitForLoadState("domcontentloaded");

  expect(page.url()).not.toContain("/admin/documentacion");
});
