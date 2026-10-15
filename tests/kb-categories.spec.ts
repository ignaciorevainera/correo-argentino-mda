import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/index";
import { kbArticles, kbCategories } from "../src/db/schema";
import { setSessionCookie } from "./helpers/auth";
import {
  ensureCategoryFixture,
  expectKbDenied,
  KbTestFixture,
  readCsrfToken,
  setEasyMdeContent,
  uniqueToken,
  type KbTestMesa,
} from "./helpers/kb";

const DEFAULT_CATEGORIES = [
  "Accesos",
  "Guías",
  "Preguntas frecuentes",
  "Procedimientos",
  "Soluciones",
];

const REDIRECT = 302;

let fixture: KbTestFixture;
let mesa: KbTestMesa;
let createdCategoryIds: number[];
let fixtureHelpdeskIds: number[];

const findCategory = async (name: string) => {
  const [row] = await db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(
      and(
        eq(kbCategories.helpdeskId, mesa.invgateId),
        eq(kbCategories.name, name),
      ),
    )
    .limit(1);
  return row;
};

const createCategoryViaUi = async (page: Page, name: string) => {
  await page.locator("#kb-category-name").fill(name);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/base-conocimiento/categorias",
  );
  await page.getByRole("button", { name: "Agregar categoría" }).click();
  await responsePromise;

  const created = await findCategory(name);
  if (!created) throw new Error(`Category "${name}" was not created`);
  createdCategoryIds.push(created.id);
  return created.id;
};

test.beforeEach(async () => {
  fixture = new KbTestFixture();
  mesa = await fixture.createMesa();
  createdCategoryIds = [];
  fixtureHelpdeskIds = [mesa.invgateId];
});

test.afterEach(async () => {
  if (createdCategoryIds.length > 0) {
    db.delete(kbCategories)
      .where(inArray(kbCategories.id, createdCategoryIds))
      .run();
  }
  if (fixtureHelpdeskIds.length > 0) {
    db.delete(kbCategories)
      .where(inArray(kbCategories.helpdeskId, fixtureHelpdeskIds))
      .run();
  }
  await fixture.cleanup();
});

test.describe("Base de conocimiento - ABM de categorías", () => {
  test("un agente no accede al ABM y es redirigido con error", async ({
    context,
    page,
  }) => {
    const agent = await fixture.createUser("agent", mesa);
    await setSessionCookie(context, agent.signedSessionId);

    const denial = await context.request.get("/base-conocimiento/categorias", {
      maxRedirects: 0,
    });
    expectKbDenied(denial);

    await page.goto("/base-conocimiento/categorias");
    await expect(page.locator("#global-toast-container")).toContainText(
      "Acceso no autorizado",
    );
    await expect(page.locator("#kb-category-name")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Categorías" })).toHaveCount(
      0,
    );
  });

  test("muestra los defaults de la mesa al entrar por primera vez", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    await page.goto("/base-conocimiento/categorias");

    await expect(
      page.getByRole("heading", { name: "Categorías", exact: true }),
    ).toBeVisible();
    for (const label of DEFAULT_CATEGORIES) {
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("rechaza un alta duplicada (case-insensitive) sin crear fila", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/base-conocimiento/categorias");

    await page.locator("#kb-category-name").fill("accesos");
    await page.getByRole("button", { name: "Agregar categoría" }).click();

    await expect(
      page.getByText("Ya existe una categoría con ese nombre en la mesa."),
    ).toBeVisible();

    const [total] = await db
      .select({ total: sql<number>`count(*)` })
      .from(kbCategories)
      .where(eq(kbCategories.helpdeskId, mesa.invgateId));
    expect(Number(total.total)).toBe(DEFAULT_CATEGORIES.length);

    const rows = await db
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(
        and(
          eq(kbCategories.helpdeskId, mesa.invgateId),
          sql`lower(${kbCategories.name}) = lower('accesos')`,
        ),
      );
    expect(rows).toHaveLength(1);
  });

  test("crea una categoría válida y la refleja en el listado", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/base-conocimiento/categorias");

    const nombre = `Redes E2E ${uniqueToken()}`;
    await createCategoryViaUi(page, nombre);

    await expect(page.locator("#global-toast-container")).toContainText(
      `Categoría "${nombre}" creada.`,
    );
    await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/nueva_categoria=/);
  });

  test("renombra la categoría y cascadea a los artículos de la mesa", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/base-conocimiento/categorias");

    const nombre = `Cascada E2E ${uniqueToken()}`;
    await createCategoryViaUi(page, nombre);
    await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();

    const article = await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Artículo cascada ${uniqueToken()}`,
      category: nombre,
      status: "draft",
    });

    const renombrada = `${nombre} v2`;
    const row = page.locator("li").filter({ hasText: nombre });
    await row.getByRole("link", { name: `Editar ${nombre}` }).click();
    await row.locator('input[name="name"]').fill(renombrada);
    await row.locator('input[name="name"]').press("Enter");

    await expect(page.locator("#global-toast-container")).toContainText(
      "Categoría actualizada.",
    );
    await expect(
      page.getByText(renombrada, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(nombre, { exact: true })).toHaveCount(0);

    const [updated] = await db
      .select({ category: kbArticles.category })
      .from(kbArticles)
      .where(eq(kbArticles.id, article.id));
    expect(updated.category).toBe(renombrada);
  });

  test("renombra una categoría cascadeando variantes de espacio y mayúsculas", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const token = uniqueToken();
    const nombre = `Cascade ${token}`;
    await ensureCategoryFixture(mesa.invgateId, nombre);

    const article = await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Artículo variante ${token}`,
      category: `cascade ${token} `,
      status: "draft",
    });

    await page.goto("/base-conocimiento/categorias");
    const renombrada = `Renombrada ${token}`;
    const row = page.locator("li").filter({ hasText: nombre });
    await row.getByRole("link", { name: `Editar ${nombre}` }).click();
    await row.locator('input[name="name"]').fill(renombrada);
    await row.locator('input[name="name"]').press("Enter");

    await expect(page.locator("#global-toast-container")).toContainText(
      "Categoría actualizada.",
    );

    const [updated] = await db
      .select({ category: kbArticles.category })
      .from(kbArticles)
      .where(eq(kbArticles.id, article.id));
    expect(updated.category).toBe(renombrada);
  });

  test("bloquea la baja de una categoría en uso", async ({ context, page }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/base-conocimiento/categorias");

    const nombre = `En uso E2E ${uniqueToken()}`;
    await createCategoryViaUi(page, nombre);
    await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();

    await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Artículo en uso ${uniqueToken()}`,
      category: nombre,
      status: "draft",
    });

    const row = page.locator("li").filter({ hasText: nombre });
    let dialogFired = false;
    page.once("dialog", (dialog) => {
      dialogFired = true;
      dialog.accept();
    });
    await row.getByRole("button", { name: `Eliminar ${nombre}` }).click();

    await expect(
      page.getByText(
        "La categoría está en uso en artículos y no se puede eliminar.",
      ),
    ).toBeVisible();
    await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
    expect(dialogFired).toBe(true);

    const stillThere = await findCategory(nombre);
    expect(stillThere).toBeTruthy();
  });

  test("elimina una categoría sin uso", async ({ context, page }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/base-conocimiento/categorias");

    const nombre = `Sin uso E2E ${uniqueToken()}`;
    await createCategoryViaUi(page, nombre);
    await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();

    const row = page.locator("li").filter({ hasText: nombre });
    let dialogFired = false;
    page.once("dialog", (dialog) => {
      dialogFired = true;
      dialog.accept();
    });
    await row.getByRole("button", { name: `Eliminar ${nombre}` }).click();

    await expect(page.locator("#global-toast-container")).toContainText(
      "Categoría eliminada.",
    );
    await expect(page.getByText(nombre, { exact: true })).toHaveCount(0);
    expect(dialogFired).toBe(true);
    expect(await findCategory(nombre)).toBeUndefined();
  });

  test("el formulario usa select y permite crear categoria inline", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const nombre = `Inline E2E ${randomUUID().slice(0, 8)}`;

    await page.goto("/base-conocimiento/create");

    const select = page.locator("#kb-category");
    await expect(select).toHaveJSProperty("tagName", "SELECT");
    await expect(select.locator("option")).toContainText(["Sin categoría"]);
    await expect(
      page.getByRole("link", { name: "Administrar categorías" }),
    ).toBeVisible();

    await page.getByText("Nueva categoría", { exact: true }).click();
    await page.getByLabel("Nombre de la nueva categoría").fill(nombre);
    await page.getByRole("button", { name: "Crear categoría" }).click();

    await expect(page.locator("#kb-category")).toHaveValue(nombre);

    // Con base raíz el doble prefijo no puede manifestarse; este assert sólo
    // detecta composiciones que dupliquen la sección. La cobertura con base
    // distinta de "/" vive en tests/unit/kb/redirects.test.ts.
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).toBe("/base-conocimiento/create");
    expect(finalUrl.pathname).not.toContain(
      "/base-conocimiento/base-conocimiento",
    );

    const [creada] = await db
      .select()
      .from(kbCategories)
      .where(eq(kbCategories.name, nombre))
      .limit(1);
    expect(creada).toBeTruthy();
    if (!creada) throw new Error(`Category "${nombre}" was not created`);
    createdCategoryIds.push(creada.id);
  });

  test("conserva una categoría legada que no está en el catálogo", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const legado = `Legado ${uniqueToken()}`;
    const article = await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Artículo legado ${uniqueToken()}`,
      category: legado,
    });

    await page.goto(`/base-conocimiento/edit/${article.id}`);

    const select = page.locator("#kb-category");
    await expect(select).toHaveValue(legado);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/base-conocimiento/edit/${article.id}`,
    );
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await responsePromise;

    const [stored] = await db
      .select({ category: kbArticles.category })
      .from(kbArticles)
      .where(eq(kbArticles.id, article.id));
    expect(stored.category).toBe(legado);
  });

  test("crea una categoría inline desde la edición y la deja preseleccionada", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const seededName = `Seed ${uniqueToken()}`;
    const seededId = await ensureCategoryFixture(mesa.invgateId, seededName);
    expect(seededId).toBeGreaterThan(0);

    const article = await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Editable inline ${uniqueToken()}`,
      category: seededName,
      status: "draft",
    });

    await page.goto(`/base-conocimiento/edit/${article.id}`);

    await expect(
      page.getByRole("link", { name: "Administrar categorías" }),
    ).toBeVisible();
    await expect(page.locator("#kb-category")).toHaveValue(seededName);

    const nombre = `Edit inline E2E ${randomUUID().slice(0, 8)}`;
    await page.getByText("Nueva categoría", { exact: true }).click();
    await page.getByLabel("Nombre de la nueva categoría").fill(nombre);
    await page.getByRole("button", { name: "Crear categoría" }).click();

    await expect(page.locator("#kb-category")).toHaveValue(nombre);
    await expect(page.locator("#kb-category")).not.toHaveValue(seededName);

    const creada = await findCategory(nombre);
    if (!creada) throw new Error(`Category "${nombre}" was not created`);
    createdCategoryIds.push(creada.id);
  });

  test("rechaza un nombre con solo espacios sin crear fila", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/base-conocimiento/categorias");

    await page.locator("#kb-category-name").fill("   ");
    await page.getByRole("button", { name: "Agregar categoría" }).click();

    await expect(
      page.getByText("El nombre debe tener entre 2 y 60 caracteres."),
    ).toBeVisible();

    const [total] = await db
      .select({ total: sql<number>`count(*)` })
      .from(kbCategories)
      .where(eq(kbCategories.helpdeskId, mesa.invgateId));
    expect(Number(total.total)).toBe(DEFAULT_CATEGORIES.length);
  });

  test("rechaza el alta inline de un admin con una mesa deshabilitada", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    const csrfToken = await readCsrfToken(
      page,
      "/base-conocimiento/categorias",
    );

    const response = await context.request.post(
      "/base-conocimiento/categorias",
      {
        form: {
          action: "create",
          name: `Mesa inválida ${uniqueToken()}`,
          returnTo: "/base-conocimiento/create",
          helpdeskId: "999999999",
          csrf_token: csrfToken,
        },
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBe(REDIRECT);
    const location = new URL(
      response.headers().location,
      test.info().project.use.baseURL ?? "http://localhost:4321",
    );
    expect(location.pathname).toBe("/base-conocimiento/create");
    expect(location.searchParams.get("toast_msg")).toBe(
      "La mesa indicada no existe o está deshabilitada.",
    );
    expect(location.searchParams.get("toast_type")).toBe("error");

    const creadas = await db
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(eq(kbCategories.helpdeskId, 999999999));
    expect(creadas).toEqual([]);
  });

  test("el alta inline desde create respeta la mesa elegida por el admin", async ({
    context,
    page,
  }) => {
    const secondMesa = await fixture.createMesa();
    fixtureHelpdeskIds.push(secondMesa.invgateId);
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    await page.goto("/base-conocimiento/create");
    await page
      .locator("#kb-helpdesk")
      .selectOption(String(secondMesa.invgateId));

    const nombre = `Mesa B E2E ${randomUUID().slice(0, 8)}`;
    await page.getByText("Nueva categoría", { exact: true }).click();
    await page.getByLabel("Nombre de la nueva categoría").fill(nombre);
    await page.getByRole("button", { name: "Crear categoría" }).click();

    await expect(page.locator("#kb-category")).toHaveValue(nombre);
    await expect(page.locator("#kb-helpdesk")).toHaveValue(
      String(secondMesa.invgateId),
    );

    const [creada] = await db
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(
        and(
          eq(kbCategories.helpdeskId, secondMesa.invgateId),
          eq(kbCategories.name, nombre),
        ),
      )
      .limit(1);
    expect(creada).toBeTruthy();
    if (!creada) throw new Error(`Category "${nombre}" was not created`);
    createdCategoryIds.push(creada.id);

    const mesaBCategorias = await db
      .select({ name: kbCategories.name })
      .from(kbCategories)
      .where(eq(kbCategories.helpdeskId, secondMesa.invgateId));
    expect(mesaBCategorias.map((row) => row.name)).toEqual(
      expect.arrayContaining([...DEFAULT_CATEGORIES, nombre]),
    );
  });

  test("un error de validación en create conserva la categoría elegida y limpia el alta inline", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    await page.goto("/base-conocimiento/create");
    const inline = `Inline stale ${uniqueToken()}`;
    await page.getByText("Nueva categoría", { exact: true }).click();
    await page.getByLabel("Nombre de la nueva categoría").fill(inline);
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.locator("#kb-category")).toHaveValue(inline);

    await page.locator("#kb-category").selectOption("Accesos");
    await page.locator("#kb-title").fill(`Título ${uniqueToken()}`);
    await setEasyMdeContent(page, "   \n  ");
    await page.getByRole("button", { name: "Crear artículo" }).click();

    await expect(
      page.getByText("El contenido del artículo es obligatorio."),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/nueva_categoria=/);
    await expect(page.locator("#kb-category")).toHaveValue("Accesos");

    const creada = await findCategory(inline);
    if (creada) createdCategoryIds.push(creada.id);
  });

  test("un error de validación en edición conserva la categoría elegida y limpia el alta inline", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    const article = await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Editable stale ${uniqueToken()}`,
      status: "draft",
    });

    await page.goto(`/base-conocimiento/edit/${article.id}`);
    const inline = `Edit stale ${uniqueToken()}`;
    await page.getByText("Nueva categoría", { exact: true }).click();
    await page.getByLabel("Nombre de la nueva categoría").fill(inline);
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.locator("#kb-category")).toHaveValue(inline);

    await page.locator("#kb-category").selectOption("Accesos");
    await setEasyMdeContent(page, "   \n  ");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(
      page.getByText("El contenido del artículo es obligatorio."),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/nueva_categoria=/);
    await expect(page.locator("#kb-category")).toHaveValue("Accesos");

    const creada = await findCategory(inline);
    if (creada) createdCategoryIds.push(creada.id);
  });

  test("create rechaza una categoría inyectada que no existe en el catálogo", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    const title = `Inyección ${uniqueToken()}`;
    const inyectada = `Inyectada ${uniqueToken()}`;

    await page.goto(
      `/base-conocimiento/create?nueva_categoria=${encodeURIComponent(inyectada)}`,
    );
    await expect(page.locator("#kb-category")).toHaveValue(inyectada);
    await page.locator("#kb-title").fill(title);
    await setEasyMdeContent(page, `Contenido ${uniqueToken()}`);
    await page.getByRole("button", { name: "Crear artículo" }).click();

    await expect(
      page.getByText("La categoría seleccionada no es válida."),
    ).toBeVisible();

    const rows = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(
        and(
          eq(kbArticles.helpdeskId, mesa.invgateId),
          eq(kbArticles.title, title),
        ),
      );
    expect(rows).toEqual([]);
  });

  test("un team_leader no accede al ABM y no puede forzar el alta inline", async ({
    context,
    page,
  }) => {
    const secondMesa = await fixture.createMesa();
    fixtureHelpdeskIds.push(secondMesa.invgateId);
    const leader = await fixture.createUser("team_leader", mesa);
    await setSessionCookie(context, leader.signedSessionId);

    const denial = await context.request.get("/base-conocimiento/categorias", {
      maxRedirects: 0,
    });
    expectKbDenied(denial);

    const nombre = `Forzada ${uniqueToken()}`;
    const forced = await context.request.post("/base-conocimiento/categorias", {
      form: {
        action: "create",
        name: nombre,
        helpdeskId: String(secondMesa.invgateId),
        returnTo: "/base-conocimiento/create",
      },
      maxRedirects: 0,
    });
    expect(forced.status()).toBe(REDIRECT);
    const forcedLocation = new URL(
      forced.headers().location,
      test.info().project.use.baseURL ?? "http://localhost:4321",
    );
    expect(forcedLocation.pathname).toBe("/");
    expect(forcedLocation.searchParams.get("toast_msg")).toBe(
      "Acceso no autorizado",
    );

    const forzadas = await db
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(
        and(
          eq(kbCategories.helpdeskId, secondMesa.invgateId),
          eq(kbCategories.name, nombre),
        ),
      );
    expect(forzadas).toEqual([]);
  });

  test("el alta inline con returnTo al formulario redirige con la categoría nueva en la URL", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    const csrfToken = await readCsrfToken(
      page,
      "/base-conocimiento/categorias",
    );

    const nombre = `Inline URL ${uniqueToken()}`;
    const response = await context.request.post(
      "/base-conocimiento/categorias",
      {
        form: {
          action: "create",
          name: nombre,
          returnTo: "/base-conocimiento/create",
          csrf_token: csrfToken,
        },
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBe(REDIRECT);
    const location = new URL(
      response.headers().location,
      test.info().project.use.baseURL ?? "http://localhost:4321",
    );
    expect(location.pathname).toBe("/base-conocimiento/create");
    expect(location.searchParams.get("nueva_categoria")).toBe(nombre);
    expect(location.searchParams.get("toast_type")).toBe("success");

    const creada = await findCategory(nombre);
    expect(creada).toBeTruthy();
    if (creada) createdCategoryIds.push(creada.id);
  });

  test("un returnTo externo cae al ABM y no redirige afuera", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);
    const csrfToken = await readCsrfToken(
      page,
      "/base-conocimiento/categorias",
    );

    const nombre = `Open redirect ${uniqueToken()}`;
    const response = await context.request.post(
      "/base-conocimiento/categorias",
      {
        form: {
          action: "create",
          name: nombre,
          returnTo: "https://evil.example/steal",
          csrf_token: csrfToken,
        },
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBe(REDIRECT);
    const location = new URL(
      response.headers().location,
      test.info().project.use.baseURL ?? "http://localhost:4321",
    );
    expect(location.pathname).toBe("/base-conocimiento/categorias");

    const creada = await findCategory(nombre);
    if (creada) createdCategoryIds.push(creada.id);
  });

  test("en estado normal no hay ningún input de texto en la lista", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    await page.goto("/base-conocimiento/categorias");
    await expect(page.locator("[data-kb-categories-list]")).toBeVisible();
    await expect(
      page.locator('[data-kb-categories-list] input[type="text"]'),
    ).toHaveCount(0);
    await expect(page.locator("[data-kb-uncategorized]")).toHaveCount(0);
  });

  test("renombrar requiere la acción explícita, precarga y Cancela sin persistir", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const original = `Rename ${uniqueToken()}`;
    const id = await ensureCategoryFixture(mesa.invgateId, original);

    await page.goto("/base-conocimiento/categorias");
    await page.getByRole("link", { name: `Editar ${original}` }).click();

    const input = page.locator(`#kb-category-rename-${id}`);
    await expect(input).toHaveValue(original);

    // Guardar sin cambios no produce error.
    await page.getByRole("button", { name: `Guardar ${original}` }).click();
    await expect(page.getByText("Categoría actualizada.")).toBeVisible();

    // Cancelar no persiste.
    await page.getByRole("link", { name: `Editar ${original}` }).click();
    await input.fill(`${original} X`);
    await page.getByRole("link", { name: "Cancelar" }).click();
    await expect(
      page.getByRole("link", { name: `Editar ${original}` }),
    ).toBeVisible();

    const rows = await db
      .select({ name: kbCategories.name })
      .from(kbCategories)
      .where(eq(kbCategories.id, id));
    expect(rows.map((row) => row.name)).toEqual([original]);
  });

  test("las acciones de la fila están alineadas y del mismo tamaño", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const nombre = `Alineado ${uniqueToken()}`;
    await ensureCategoryFixture(mesa.invgateId, nombre);
    await page.goto("/base-conocimiento/categorias");

    const editar = page.getByRole("link", { name: `Editar ${nombre}` });
    const eliminar = page.getByRole("button", { name: `Eliminar ${nombre}` });
    const [cajaEditar, cajaEliminar] = await Promise.all([
      editar.boundingBox(),
      eliminar.boundingBox(),
    ]);
    expect(cajaEditar && cajaEliminar).toBeTruthy();
    expect(
      Math.abs((cajaEditar?.y ?? 0) - (cajaEliminar?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((cajaEditar?.height ?? 0) - (cajaEliminar?.height ?? 0)),
    ).toBeLessThanOrEqual(1);
  });

  test("el conteo del ABM suma variantes de espacio y mayúsculas", async ({
    context,
    page,
  }) => {
    const admin = await fixture.createUser("admin", mesa);
    await setSessionCookie(context, admin.signedSessionId);

    const categoria = `Conteo ${uniqueToken()}`;
    await ensureCategoryFixture(mesa.invgateId, categoria);
    await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Conteo A ${uniqueToken()}`,
      category: categoria,
      status: "draft",
    });
    await fixture.createArticle({
      mesa,
      authorUserId: admin.userId,
      title: `Conteo B ${uniqueToken()}`,
      category: `${categoria.toLowerCase()} `,
      status: "draft",
    });

    await page.goto("/base-conocimiento/categorias");
    const fila = page.locator("li").filter({ hasText: categoria });
    await expect(fila).toContainText("2 artículo(s)");
  });
});
