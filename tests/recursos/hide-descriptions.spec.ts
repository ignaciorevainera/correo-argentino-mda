import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { resourceCategories, resourceLinks } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

/**
 * Issue #123 (causa 3): la preferencia "Ocultar descripciones" se perdía en cada
 * recarga porque se evaluaba en el frontmatter del servidor (sin localStorage) y
 * el listener solo aplicaba el estado en `change`, nunca en la carga.
 *
 * El island debe aplicar la preferencia guardada al inicializar: checkbox +
 * clase `hide-descriptions` en el grid -> descripciones ocultas.
 */

const CATEGORY_TITLE = "Cat E2E hide desc";
const LINK_TITLE = "Enlace E2E hide desc";
const STORAGE_KEY = "enlacesHideDescriptions";

let admin: TestUser;
let categoryId: number;
let linkId: number;

test.beforeAll(async () => {
  admin = await createTestUserAndSession("admin");

  const [cat] = await db
    .insert(resourceCategories)
    .values({
      title: CATEGORY_TITLE,
      iconName: "boxicons:link",
      sortOrder: -9997,
    })
    .returning({ id: resourceCategories.id });
  categoryId = cat.id;

  const [link] = await db
    .insert(resourceLinks)
    .values({
      categoryId,
      title: LINK_TITLE,
      subtitle: "Subtítulo E2E hide desc",
      url: "https://example.com/hide-desc",
    })
    .returning({ id: resourceLinks.id });
  linkId = link.id;
});

test.afterAll(async () => {
  if (linkId) await db.delete(resourceLinks).where(eq(resourceLinks.id, linkId));
  if (categoryId)
    await db
      .delete(resourceCategories)
      .where(eq(resourceCategories.id, categoryId));
  if (admin) await cleanupTestUser(admin.userId, admin.sessionId);
});

function controls(page: Page) {
  return {
    toggle: page.locator("#hide-descriptions-toggle"),
    grid: page.locator("#important-links-grid"),
    subtitle: page
      .locator("[data-link-item]", { hasText: LINK_TITLE })
      .locator("[data-link-subtitle]"),
  };
}

async function gotoRecursos(page: Page): Promise<void> {
  await page.goto("/recursos", { waitUntil: "load" });
  await page.waitForSelector("#important-links-grid .grid-item");
  // El island fija data-view-mode al correr su script: señal de hidratación.
  await page.waitForFunction(() =>
    document.documentElement.hasAttribute("data-view-mode"),
  );
}

test.describe("/recursos — preferencia 'Ocultar descripciones'", () => {
  test("aplica la preferencia guardada en la carga y la mantiene al recargar", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);
    // Solo siembra el valor inicial: si ya existe (toggled), no lo pisa.
    await page.addInitScript((key) => {
      try {
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, "true");
        }
      } catch {
        /* ignore */
      }
    }, STORAGE_KEY);

    await gotoRecursos(page);

    const { toggle, grid, subtitle } = controls(page);
    await expect(toggle).toBeChecked();
    await expect(grid).toHaveClass(/hide-descriptions/);
    await expect(subtitle).toBeHidden();

    // Persistencia: recargar no debe perder el estado.
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() =>
      document.documentElement.hasAttribute("data-view-mode"),
    );
    await expect(toggle).toBeChecked();
    await expect(grid).toHaveClass(/hide-descriptions/);
    await expect(subtitle).toBeHidden();
  });

  test("el toggle sigue funcionando y persiste en ambas direcciones", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);
    // Sin preferencia: arranca visible.
    await gotoRecursos(page);

    const { toggle, grid, subtitle } = controls(page);
    await expect(toggle).not.toBeChecked();
    await expect(subtitle).toBeVisible();

    // Ocultar -> clase aplicada + persistida.
    await toggle.check();
    await expect(grid).toHaveClass(/hide-descriptions/);
    await expect(subtitle).toBeHidden();

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() =>
      document.documentElement.hasAttribute("data-view-mode"),
    );
    await expect(toggle).toBeChecked();
    await expect(subtitle).toBeHidden();

    // Mostrar -> vuelve a verse + persiste.
    await toggle.uncheck();
    await expect(grid).not.toHaveClass(/hide-descriptions/);
    await expect(subtitle).toBeVisible();

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() =>
      document.documentElement.hasAttribute("data-view-mode"),
    );
    await expect(toggle).not.toBeChecked();
    await expect(subtitle).toBeVisible();
  });
});
