import "dotenv/config";
import { expect, test } from "@playwright/test";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../src/db/index";
import { auditLogs, kbCategories } from "../src/db/schema";
import { setSessionCookie } from "./helpers/auth";
import {
  KbTestFixture,
  setEasyMdeContent,
  uniqueToken,
  type KbTestMesa,
} from "./helpers/kb";

let fixture: KbTestFixture;
let mesa: KbTestMesa;

test.beforeEach(async () => {
  fixture = new KbTestFixture();
  mesa = await fixture.createMesa();
});

test.afterEach(async () => {
  db.delete(kbCategories)
    .where(eq(kbCategories.helpdeskId, mesa.invgateId))
    .run();
  await fixture.cleanup();
});

type AuditState = Record<string, unknown>;

type AuditRow = {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  beforeState: AuditState | null;
  afterState: AuditState | null;
};

const MAX_AUDIT_STATE_CHARS = 2000;

const readAuditRows = (username: string, watermark: number): AuditRow[] =>
  db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      beforeState: auditLogs.beforeState,
      afterState: auditLogs.afterState,
    })
    .from(auditLogs)
    .where(and(gt(auditLogs.id, watermark), eq(auditLogs.username, username)))
    .orderBy(auditLogs.id)
    .all()
    .map((row) => ({
      ...row,
      beforeState: (row.beforeState as AuditState | null) ?? null,
      afterState: (row.afterState as AuditState | null) ?? null,
    }));

const expectCompactState = (
  state: AuditState,
  expectedKeys: readonly string[],
): void => {
  expect(Object.keys(state).sort()).toEqual([...expectedKeys]);
  expect(JSON.stringify(state).length).toBeLessThan(MAX_AUDIT_STATE_CHARS);
};

const largeArticleBody = () =>
  Array.from(
    { length: 60 },
    (_, index) => `Línea ${index} ${"x".repeat(40)}`,
  ).join("\n");

const readCategoryId = (helpdeskId: number, name: string): number => {
  const [row] = db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(
      and(eq(kbCategories.helpdeskId, helpdeskId), eq(kbCategories.name, name)),
    )
    .limit(1)
    .all();
  if (!row) throw new Error(`No se encontró la categoría "${name}"`);
  return row.id;
};

const currentAuditWatermark = (): number => {
  const [row] = db
    .select({ maxId: sql<number | null>`MAX(${auditLogs.id})` })
    .from(auditLogs)
    .all();
  return Number(row?.maxId ?? 0);
};

test("el alta de artículo y su publicación dejan registros estructurados", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  const watermark = fixture.auditLogWatermark;

  const title = `Auditoría ${uniqueToken()}`;
  await page.goto("/base-conocimiento/create");
  await page.locator("#kb-title").fill(title);
  await page.locator("#kb-category").selectOption("Accesos");
  await setEasyMdeContent(page, `Contenido ${uniqueToken()}`);
  await page.getByRole("button", { name: "Crear artículo" }).click();
  await expect(page.locator("#global-toast-container")).toContainText(
    "Artículo creado con éxito.",
  );

  const createRows = readAuditRows(admin.username, watermark);
  expect(createRows).toHaveLength(1);
  const [created] = createRows;
  expect(created.action).toBe(`Creó el artículo "${title}"`);
  expect(created.entityType).toBe("kb_article");
  expect(created.entityId).toBeGreaterThan(0);
  expect(created.beforeState).toBeNull();
  expect(created.afterState).toEqual({
    title,
    helpdeskId: mesa.invgateId,
    category: "Accesos",
    status: "draft",
  });
  expectCompactState(created.afterState ?? {}, [
    "category",
    "helpdeskId",
    "status",
    "title",
  ]);
  if (created.entityId) fixture.trackArticle(created.entityId);

  const watermarkAfterCreate = currentAuditWatermark();
  await page.goto(`/base-conocimiento/edit/${created.entityId}`);
  await page.locator("#kb-status").selectOption("published");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#global-toast-container")).toContainText(
    "Artículo publicado con éxito.",
  );

  const rows = readAuditRows(admin.username, watermarkAfterCreate);
  const update = rows.find((row) =>
    row.action.includes("Actualizó el artículo"),
  );
  const publication = rows.find((row) =>
    row.action.includes("Publicó el artículo"),
  );
  expect(publication).toBeDefined();
  expect(update).toBeUndefined();
  expect(rows).toHaveLength(1);
  expect(publication?.entityType).toBe("kb_article");
  expect(publication?.entityId).toBe(created.entityId);
  expect(publication?.beforeState).toEqual({ status: "draft" });
  expect(publication?.afterState).toEqual({ status: "published" });
});

test("el alta de un artículo publicado no fabrica una transición de estado", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  const watermark = fixture.auditLogWatermark;

  const title = `Publicado ${uniqueToken()}`;
  await page.goto("/base-conocimiento/create");
  await page.locator("#kb-title").fill(title);
  await page.locator("#kb-category").selectOption("Accesos");
  await page.locator("#kb-status").selectOption("published");
  await setEasyMdeContent(page, `Contenido publicado ${uniqueToken()}`);
  await page.getByRole("button", { name: "Crear artículo" }).click();
  await expect(page.locator("#global-toast-container")).toContainText(
    "Artículo creado con éxito.",
  );

  const rows = readAuditRows(admin.username, watermark);
  expect(rows).toHaveLength(1);
  const [created] = rows;
  expect(created.action).toBe(`Creó el artículo "${title}"`);
  expect(created.entityType).toBe("kb_article");
  expect(created.beforeState).toBeNull();
  expect(created.afterState).toEqual({
    title,
    helpdeskId: mesa.invgateId,
    category: "Accesos",
    status: "published",
  });
  expectCompactState(created.afterState ?? {}, [
    "category",
    "helpdeskId",
    "status",
    "title",
  ]);
  expect(
    rows.filter((row) => row.action.includes("Publicó el artículo")),
  ).toEqual([]);
  if (created.entityId) fixture.trackArticle(created.entityId);
});

test("una edición que conserva el estado deja una sola fila con los campos editados", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);

  const initialTitle = `Sin cambio de estado ${uniqueToken()}`;
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: initialTitle,
    content: largeArticleBody(),
    category: null,
    status: "published",
  });
  const watermark = currentAuditWatermark();

  const updatedTitle = `${initialTitle} v2`;
  await page.goto(`/base-conocimiento/edit/${article.id}`);
  await page.locator("#kb-title").fill(updatedTitle);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#global-toast-container")).toContainText(
    "Artículo actualizado con éxito.",
  );

  const rows = readAuditRows(admin.username, watermark);
  expect(rows).toHaveLength(1);
  const [update] = rows;
  expect(update.action).toBe(`Actualizó el artículo "${updatedTitle}"`);
  expect(update.entityType).toBe("kb_article");
  expect(update.entityId).toBe(article.id);
  expect(update.beforeState).toEqual({
    title: initialTitle,
    category: null,
    status: "published",
  });
  expect(update.afterState).toEqual({
    title: updatedTitle,
    category: null,
    status: "published",
  });
  expectCompactState(update.beforeState ?? {}, ["category", "status", "title"]);
  expectCompactState(update.afterState ?? {}, ["category", "status", "title"]);

  const watermarkAfterEdit = currentAuditWatermark();
  await page.goto(`/base-conocimiento/edit/${article.id}`);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#global-toast-container")).toContainText(
    "Artículo actualizado con éxito.",
  );

  expect(readAuditRows(admin.username, watermarkAfterEdit)).toEqual([]);
});

test("el alta de categoría registra la entidad creada con su nombre y su mesa", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  const watermark = fixture.auditLogWatermark;

  const nombre = `Alta audit ${uniqueToken()}`;
  await page.goto("/base-conocimiento/categorias");
  await page.locator("#kb-category-name").fill(nombre);
  await page.getByRole("button", { name: "Agregar categoría" }).click();
  await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();

  const categoriaId = readCategoryId(mesa.invgateId, nombre);
  const rows = readAuditRows(admin.username, watermark);
  expect(rows).toHaveLength(1);
  const [created] = rows;
  expect(created.action).toBe(`Creó la categoría "${nombre}"`);
  expect(created.entityType).toBe("kb_category");
  expect(created.entityId).toBe(categoriaId);
  expect(created.beforeState).toBeNull();
  expect(created.afterState).toEqual({
    name: nombre,
    helpdeskId: mesa.invgateId,
  });
  expectCompactState(created.afterState ?? {}, ["helpdeskId", "name"]);
});

test("la baja de categoría registra nombre y mesa antes de eliminar", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);

  const nombre = `Baja audit ${uniqueToken()}`;
  await page.goto("/base-conocimiento/categorias");
  await page.locator("#kb-category-name").fill(nombre);
  await page.getByRole("button", { name: "Agregar categoría" }).click();
  await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
  const categoriaId = readCategoryId(mesa.invgateId, nombre);

  const watermarkAfterCreate = currentAuditWatermark();
  const row = page.locator("li").filter({ hasText: nombre });
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Eliminar ${nombre}` }).click();
  await expect(page.getByText("Categoría eliminada.")).toBeVisible();

  const rows = readAuditRows(admin.username, watermarkAfterCreate);
  expect(rows).toHaveLength(1);
  const [deleted] = rows;
  expect(deleted.action).toBe(`Eliminó la categoría "${nombre}"`);
  expect(deleted.entityType).toBe("kb_category");
  expect(deleted.entityId).toBe(categoriaId);
  expect(deleted.beforeState).toEqual({
    name: nombre,
    helpdeskId: mesa.invgateId,
    articlesInUse: 0,
  });
  expect(deleted.afterState).toBeNull();
});

test("el renombrado de categoría registra el nombre anterior y la cascada", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  const watermark = fixture.auditLogWatermark;

  const nombre = `Cascada audit ${uniqueToken()}`;
  await page.goto("/base-conocimiento/categorias");
  await page.locator("#kb-category-name").fill(nombre);
  await page.getByRole("button", { name: "Agregar categoría" }).click();
  await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
  const categoriaId = readCategoryId(mesa.invgateId, nombre);

  await fixture.createArticle({
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
  await expect(
    page.getByText(renombrada, { exact: true }).first(),
  ).toBeVisible();

  const rows = readAuditRows(admin.username, watermark);
  const rename = rows.find((row) =>
    row.action.includes("Actualizó la categoría"),
  );
  expect(rename).toBeDefined();
  expect(rename?.entityType).toBe("kb_category");
  expect(rename?.entityId).toBe(categoriaId);
  expect(rename?.beforeState).toEqual({
    name: nombre,
    helpdeskId: mesa.invgateId,
  });
  expect(rename?.afterState).toEqual({
    name: renombrada,
    helpdeskId: mesa.invgateId,
    articlesUpdated: 1,
  });
});

test("la baja bloqueada de una categoría registra el conteo de artículos en uso", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  const watermark = fixture.auditLogWatermark;

  const nombre = `En uso audit ${uniqueToken()}`;
  await page.goto("/base-conocimiento/categorias");
  await page.locator("#kb-category-name").fill(nombre);
  await page.getByRole("button", { name: "Agregar categoría" }).click();
  await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();

  await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo en uso ${uniqueToken()}`,
    category: nombre,
    status: "draft",
  });

  const row = page.locator("li").filter({ hasText: nombre });
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Eliminar ${nombre}` }).click();
  await expect(
    page.getByText(
      "La categoría está en uso en artículos y no se puede eliminar.",
    ),
  ).toBeVisible();

  const rows = readAuditRows(admin.username, watermark);
  const refused = rows.find((row) =>
    row.action.includes("No eliminó la categoría"),
  );
  expect(refused).toBeDefined();
  expect(refused?.entityType).toBe("kb_category");
  expect(refused?.entityId).toBe(readCategoryId(mesa.invgateId, nombre));
  expect(refused?.afterState).toBeNull();
  expect(refused?.beforeState).toEqual({
    name: nombre,
    helpdeskId: mesa.invgateId,
    articlesInUse: 1,
  });
});
