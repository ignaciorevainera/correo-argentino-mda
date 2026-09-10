import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";
import { db } from "../src/db/index";
import {
  applicationCategories,
  resourceCategories,
  contactCategories,
} from "../src/db/schema";
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

interface CategoryPage {
  path: string;
  heading: string;
  submitLabel: string;
}

async function firstEditableId(
  rows: { id: number; title: string }[],
): Promise<number | null> {
  const editable = rows.filter(
    (r) =>
      r.title.toLowerCase() !== "sin categoría" &&
      r.title.toLowerCase() !== "sin categoria",
  );
  return editable.length > 0 ? editable[0].id : null;
}

const createPages: CategoryPage[] = [
  {
    path: "/admin/aplicativos/categorias/create",
    heading: "Nueva categoría de aplicativos",
    submitLabel: "Guardar Categoría",
  },
  {
    path: "/admin/recursos/categoria/create",
    heading: "Nueva categoría de recursos",
    submitLabel: "Guardar",
  },
  {
    path: "/admin/contactos/categoria/create",
    heading: "Nueva categoría de contactos",
    submitLabel: "Guardar",
  },
];

for (const page of createPages) {
  test(`create ${page.path}: shell estándar`, async ({ page: p }) => {
    await p.goto(page.path);

    await expect(p.locator("nav[aria-label='Breadcrumb']")).toHaveCount(0);
    await expect(p.locator("h1")).toContainText(page.heading);

    const cancel = p.locator("a.btn-soft.btn-error").first();
    await expect(cancel).toBeVisible();

    const form = p.locator("form#categoria-form");
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute("data-async-form", "");

    await expect(
      form.locator("button[type='submit']"),
    ).toContainText(page.submitLabel);
  });
}

test("edit aplicativos/categorias: shell estándar", async ({ page }) => {
  const rows = await db
    .select({ id: applicationCategories.id, title: applicationCategories.title })
    .from(applicationCategories)
    .orderBy(asc(applicationCategories.id))
    .limit(20);
  const id = await firstEditableId(rows);
  test.skip(id === null, "Sin categorías editables de aplicativos");

  await page.goto(`/admin/aplicativos/categorias/edit/${id}`);

  await expect(page.locator("nav[aria-label='Breadcrumb']")).toHaveCount(0);
  await expect(page.locator("h1")).toContainText("Editar categoría");

  const form = page.locator("form#categoria-form");
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("data-async-form", "");
  await expect(form.locator("input[name='title']")).toBeVisible();
  await expect(form.locator("button[type='submit']")).toContainText(
    "Guardar Categoría",
  );
});

test("edit recursos/categoria: shell estándar", async ({ page }) => {
  const rows = await db
    .select({ id: resourceCategories.id, title: resourceCategories.title })
    .from(resourceCategories)
    .orderBy(asc(resourceCategories.id))
    .limit(20);
  const id = await firstEditableId(rows);
  test.skip(id === null, "Sin categorías editables de recursos");

  await page.goto(`/admin/recursos/categoria/edit/${id}`);

  await expect(page.locator("nav[aria-label='Breadcrumb']")).toHaveCount(0);
  await expect(page.locator("h1")).toContainText("Editar categoría");

  const form = page.locator("form#categoria-form");
  await expect(form).toHaveAttribute("data-async-form", "");
  await expect(form.locator("[name='iconName']")).toBeVisible();
  await expect(form.locator("button[type='submit']")).toContainText("Guardar");

  const cancel = page.locator("a.btn-soft.btn-error").first();
  await expect(cancel).toBeVisible();
});

test("edit contactos/categoria: shell estándar", async ({ page }) => {
  const rows = await db
    .select({ id: contactCategories.id, title: contactCategories.title })
    .from(contactCategories)
    .orderBy(asc(contactCategories.id))
    .limit(20);
  const id = await firstEditableId(rows);
  test.skip(id === null, "Sin categorías editables de contactos");

  await page.goto(`/admin/contactos/categoria/edit/${id}`);

  await expect(page.locator("nav[aria-label='Breadcrumb']")).toHaveCount(0);
  await expect(page.locator("h1")).toContainText("Editar categoría");

  const form = page.locator("form#categoria-form");
  await expect(form).toHaveAttribute("data-async-form", "");
  await expect(form.locator("[name='icon']")).toBeVisible();
  await expect(form.locator("button[type='submit']")).toContainText("Guardar");

  const cancel = page.locator("a.btn-soft.btn-error").first();
  await expect(cancel).toBeVisible();
});
