import "dotenv/config";
import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { deletedRecords, kbArticles, kbCategories } from "../src/db/schema";
import { setSessionCookie } from "./helpers/auth";
import {
  ensureCategoryFixture,
  expectKbDenied,
  KbTestFixture,
  readCsrfToken,
  uniqueToken,
  type KbTestMesa,
} from "./helpers/kb";

let fixture: KbTestFixture;
let mesa: KbTestMesa;
let articleId: number | undefined;

test.beforeEach(async () => {
  fixture = new KbTestFixture();
  mesa = await fixture.createMesa();
  articleId = undefined;
});

test.afterEach(async () => {
  if (articleId !== undefined) {
    db.delete(deletedRecords)
      .where(
        and(
          eq(deletedRecords.entity, "articulo"),
          eq(deletedRecords.recordId, String(articleId)),
        ),
      )
      .run();
  }
  await fixture.cleanup();
});

const articleState = async (id: number) => {
  const [row] = await db.select().from(kbArticles).where(eq(kbArticles.id, id));
  return row;
};

test("eliminar mueve el artículo a la papelera con la fila completa", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  const category = `Papelera ${uniqueToken()}`;
  await ensureCategoryFixture(mesa.invgateId, category);
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo papelera ${uniqueToken()}`,
    content: "Contenido original que debe volver.",
    category,
    status: "draft",
  });
  articleId = article.id;

  await setSessionCookie(context, admin.signedSessionId);
  await readCsrfToken(page, `/base-conocimiento/${article.id}`);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar artículo" }).click();
  await page.waitForURL(/\/base-conocimiento\?toast_msg=/);

  await expect(page.locator("#global-toast-container")).toContainText(
    "Artículo movido a la papelera.",
  );

  expect(await articleState(article.id)).toBeUndefined();

  const [snapshot] = await db
    .select()
    .from(deletedRecords)
    .where(
      and(
        eq(deletedRecords.entity, "articulo"),
        eq(deletedRecords.recordId, String(article.id)),
      ),
    );
  expect(snapshot).toBeDefined();
  const payload = snapshot.payload as {
    row: {
      helpdeskId: number;
      category: string;
      title: string;
      content: string;
      status: string;
    };
  };
  expect(payload.row.helpdeskId).toBe(mesa.invgateId);
  expect(payload.row.category).toBe(category);
  expect(payload.row.title).toBe(article.title);
  expect(payload.row.content).toBe(article.content);
  expect(payload.row.status).toBe("draft");

  await page.goto("/admin/papelera");
  await expect(page.getByText(article.title).first()).toBeVisible();
});

test("restaurar devuelve el artículo con la misma mesa, categoría y estado", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  const category = `Restaurar ${uniqueToken()}`;
  await ensureCategoryFixture(mesa.invgateId, category);
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo restaurar ${uniqueToken()}`,
    content: "Contenido que debe volver intacto.",
    category,
    status: "published",
    publishedByUserId: admin.userId,
  });
  articleId = article.id;
  const before = await articleState(article.id);
  if (!before) throw new Error("El artículo fixture no se creó");

  await setSessionCookie(context, admin.signedSessionId);
  await readCsrfToken(page, `/base-conocimiento/${article.id}`);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar artículo" }).click();
  await page.waitForURL(/\/base-conocimiento\?toast_msg=/);

  const [snapshot] = await db
    .select()
    .from(deletedRecords)
    .where(
      and(
        eq(deletedRecords.entity, "articulo"),
        eq(deletedRecords.recordId, String(article.id)),
      ),
    );
  expect(snapshot).toBeDefined();

  await page.goto("/admin/papelera");
  const row = page.locator("[data-table-row]").filter({ hasText: article.title });
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: /Restaurar/ }).click();
  await page.waitForURL(/toast_type=success/);

  const restored = await articleState(article.id);
  if (!restored) throw new Error("El artículo no se restauró");
  expect(restored.title).toBe(before.title);
  expect(restored.content).toBe(before.content);
  expect(restored.helpdeskId).toBe(mesa.invgateId);
  expect(restored.category).toBe(category);
  expect(restored.status).toBe("published");
  expect(restored.authorUserId).toBe(admin.userId);
  expect(restored.createdAt).toBeInstanceOf(Date);

  const [afterSnapshot] = await db
    .select({ restoredAt: deletedRecords.restoredAt })
    .from(deletedRecords)
    .where(eq(deletedRecords.id, snapshot.id));
  expect(afterSnapshot.restoredAt).not.toBeNull();
});

test("restaurar conserva la categoría aunque ya no exista en el catálogo", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  const category = `Borrada ${uniqueToken()}`;
  await ensureCategoryFixture(mesa.invgateId, category);
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo categoría borrada ${uniqueToken()}`,
    category,
    status: "draft",
  });
  articleId = article.id;

  await setSessionCookie(context, admin.signedSessionId);
  const csrfToken = await readCsrfToken(page, `/base-conocimiento/${article.id}`);

  const deleted = await context.request.post(
    `/base-conocimiento/${article.id}/eliminar`,
    { form: { csrf_token: csrfToken }, maxRedirects: 0 },
  );
  expect(deleted.status()).toBe(302);

  const [snapshot] = await db
    .select()
    .from(deletedRecords)
    .where(
      and(
        eq(deletedRecords.entity, "articulo"),
        eq(deletedRecords.recordId, String(article.id)),
      ),
    );
  expect(snapshot).toBeDefined();

  db.delete(kbCategories)
    .where(
      and(
        eq(kbCategories.helpdeskId, mesa.invgateId),
        eq(kbCategories.name, category),
      ),
    )
    .run();

  const restoredResponse = await context.request.post(
    `/admin/papelera/${snapshot.id}/restaurar`,
    { maxRedirects: 0 },
  );
  expect(restoredResponse.status()).toBe(302);

  const restored = await articleState(article.id);
  if (!restored) throw new Error("El artículo no se restauró");
  expect(restored.helpdeskId).toBe(mesa.invgateId);
  expect(restored.category).toBe(category);
});

test("un agente no puede eliminar artículos", async ({ context }) => {
  const admin = await fixture.createUser("admin", mesa);
  const agent = await fixture.createUser("agent", mesa);
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo protegido ${uniqueToken()}`,
    status: "published",
  });
  articleId = article.id;

  await setSessionCookie(context, agent.signedSessionId);
  const response = await context.request.post(
    `/base-conocimiento/${article.id}/eliminar`,
    { maxRedirects: 0 },
  );

  expectKbDenied(response);
  expect(await articleState(article.id)).toBeDefined();
});

test("sin token CSRF no elimina el artículo", async ({ context }) => {
  const admin = await fixture.createUser("admin", mesa);
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo sin CSRF ${uniqueToken()}`,
    status: "draft",
  });
  articleId = article.id;

  await setSessionCookie(context, admin.signedSessionId);
  const response = await context.request.post(
    `/base-conocimiento/${article.id}/eliminar`,
    { maxRedirects: 0 },
  );

  expect(response.status()).toBe(302);
  const location = new URL(
    response.headers().location,
    test.info().project.use.baseURL ?? "http://localhost:4321",
  );
  expect(location.pathname).toBe(`/base-conocimiento/${article.id}`);
  expect(location.searchParams.get("toast_msg")).toBe(
    "Token CSRF inválido o ausente",
  );
  expect(location.searchParams.get("toast_type")).toBe("error");
  expect(await articleState(article.id)).toBeDefined();
});
