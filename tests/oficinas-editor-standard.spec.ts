import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";
import { db } from "../src/db/index";
import { offices } from "../src/db/schema";
import { asc } from "drizzle-orm";

let adminUser: TestUser;

test.beforeAll(async () => {
  adminUser = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  if (adminUser) await cleanupTestUser(adminUser.userId, adminUser.sessionId);
});

test.beforeEach(async ({ context }) => {
  await setSessionCookie(context, adminUser.signedSessionId);
});

test("create: shell estándar sin sección de contactos", async ({ page }) => {
  await page.goto("/oficinas/create");

  // Sin breadcrumb (estándar v2): solo PageHeader
  await expect(page.locator("nav[aria-label='Breadcrumb']")).toHaveCount(0);

  // Título y subtítulo
  await expect(page.locator("h1")).toContainText("Nueva sucursal");
  await expect(page.locator("header p")).toContainText(
    "registrar una nueva sucursal",
  );

  // Botón cancelar en variante error (btn-soft btn-error), vuelve al listado
  const cancel = page.locator("a.btn-soft.btn-error").first();
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveAttribute("href", /\/oficinas$/);

  // Botón guardar (submit) con label de create
  await expect(
    page.locator("form#office-form button[type='submit']"),
  ).toContainText("Crear sucursal");

  // Sin contactos
  await expect(page.locator("#section-contacts")).toHaveCount(0);
  await expect(page.locator("#contacts-container")).toHaveCount(0);
  await expect(page.locator("[name='contact_name']")).toHaveCount(0);
});

test("edicion: shell estándar sin sección de contactos", async ({ page }) => {
  const [office] = await db
    .select({ id: offices.id })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  test.skip(!office, "Sin oficinas en la base de datos de prueba");

  await page.goto(`/oficinas/edit/${office.id}`);

  await expect(page.locator("nav[aria-label='Breadcrumb']")).toHaveCount(0);
  await expect(page.locator("h1")).toContainText("Editar:");
  await expect(
    page.locator("form#office-form button[type='submit']"),
  ).toContainText("Guardar cambios");

  const cancel = page.locator("a.btn-soft.btn-error").first();
  await expect(cancel).toBeVisible();

  await expect(page.locator("#section-contacts")).toHaveCount(0);
  await expect(page.locator("[name='contact_name']")).toHaveCount(0);
});
