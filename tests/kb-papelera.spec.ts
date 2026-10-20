import "dotenv/config";
import { expect, test } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import { deletedRecords, kbArticles } from "../src/db/schema";
import { setSessionCookie } from "./helpers/auth";
import {
  ensureCategoryFixture,
  KbTestFixture,
  readCsrfToken,
  uniqueToken,
  type KbTestMesa,
} from "./helpers/kb";

let fixture: KbTestFixture;
let mesa: KbTestMesa;
let snapshotIds: number[];

test.beforeEach(async () => {
  fixture = new KbTestFixture();
  mesa = await fixture.createMesa();
  snapshotIds = [];
});

test.afterEach(async () => {
  if (snapshotIds.length > 0) {
    db.delete(deletedRecords)
      .where(inArray(deletedRecords.id, snapshotIds))
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

  await setSessionCookie(context, admin.signedSessionId);
  const csrfToken = await readCsrfToken(
    page,
    `/base-conocimiento/${article.id}`,
  );

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
  snapshotIds.push(snapshot.id);
  const payload = snapshot.payload as {
    row: { helpdeskId: number; category: string; title: string; status: string };
  };
  expect(payload.row.helpdeskId).toBe(mesa.invgateId);
  expect(payload.row.category).toBe(category);
  expect(payload.row.title).toBe(article.title);
  expect(payload.row.status).toBe("draft");

  expect(csrfToken).not.toBe("");

  await page.goto("/admin/papelera");
  await expect(page.getByText(article.title).first()).toBeVisible();
});
