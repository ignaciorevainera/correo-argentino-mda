import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";

test.describe("Estructura de Red Postal (/oficinas/estructura)", () => {
  let admin: TestUser;

  test.beforeAll(async () => {
    admin = await createTestUserAndSession("admin");
  });

  test.afterAll(async () => {
    if (admin) await cleanupTestUser(admin.userId, admin.sessionId);
  });

  test("renderiza el canvas interactivo, muestra las 5 regiones iniciales y abre el drawer al interactuar", async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);

    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/oficinas/estructura");

    // Verificar encabezado y títulos
    await expect(page.locator("h1")).toContainText("Estructura de Red Postal");
    await expect(page.locator("a[aria-label='Volver al directorio']")).toBeVisible();

    // Canvas SVG presente
    const svg = page.locator("svg[data-tree-canvas]");
    await expect(svg).toBeVisible({ timeout: 15000 });

    // Verificar que las regiones del viewport inicial están visibles
    const initialRegionIds = ["reg-CABA", "reg-PBA-LP", "reg-NEA"];
    for (const regId of initialRegionIds) {
      await expect(page.locator(`[data-node-id='${regId}']`)).toBeVisible({ timeout: 15000 });
    }

    // Usar 'Encuadrar' (Fit-to-Screen) para ajustar todo el árbol y verificar las 5 regiones completas
    await page.locator("button:has-text('Encuadrar')").click();
    const allRegionIds = ["reg-CABA", "reg-SUR", "reg-PBA-LP", "reg-NEA", "reg-NOA"];
    for (const regId of allRegionIds) {
      await expect(page.locator(`[data-node-id='${regId}']`)).toBeVisible({ timeout: 15000 });
    }

    // Probar el filtro de "Cabeceras" en el popover flotante
    const filterFab = page.locator("button[aria-label='Abrir filtros de oficinas']");
    await expect(filterFab).toBeVisible();
    await filterFab.click();

    const cabecerasBtn = page.getByRole("button", { name: "Cabeceras" });
    await expect(cabecerasBtn).toBeVisible();
    await cabecerasBtn.click();
    await expect(cabecerasBtn).toHaveClass(/btn-secondary/);

    // Cerrar panel de filtros para interactuar limpiamente con el canvas
    await page.locator("button[aria-label='Cerrar panel de filtros']").click();

    // Probar Drawer inspector: hacer click en el nodo de CABA
    const cabaNode = page.locator("[data-node-id='reg-CABA']");
    await expect(cabaNode).toBeVisible();
    await cabaNode.click();

    const drawer = page.locator("aside[role='dialog']");
    await expect(drawer).toBeVisible();

    // Cerrar drawer con tecla Escape
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveClass(/translate-x-full/);
  });

  test("Tier 3 & Tier 4: Drawer positioning bajo Navbar, unicidad, bloqueo de scroll en main y flujo de inspección", async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);

    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/oficinas/estructura");

    // Esperar canvas listo
    await expect(page.locator("svg[data-tree-canvas]")).toBeVisible({ timeout: 15000 });

    // 1. Unicidad e inicialización: verificar que inicialmente no hay drawers montados
    const initialDrawers = await page.locator("aside[role='dialog']").count();
    expect(initialDrawers).toBe(0);

    // 2. Flujo de inspección: Clic en nodo CABA
    const cabaNode = page.locator("[data-node-id='reg-CABA']");
    await expect(cabaNode).toBeVisible();
    await cabaNode.click();

    // Al abrirse, debe existir exactamente 1 drawer (unicidad)
    const drawers = page.locator("aside[role='dialog']");
    expect(await drawers.count()).toBe(1);
    const drawer = drawers.first();
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveClass(/translate-x-0/);

    // 3. Posicionamiento en vista normal: top-20 h-[calc(100dvh-5rem)]
    await expect(drawer).toHaveClass(/top-20/);
    await expect(drawer).toHaveClass(/h-\[calc\(100dvh-5rem\)\]/);

    // Verificar que el header Navbar está presente y visible con z-150 por encima del drawer
    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    // Medir bounding box del drawer: debe comenzar a 80px (5rem) del tope
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y).toBeGreaterThanOrEqual(70); // 80px nominal en vista normal
    }

    // 4. Bloqueo de scroll en <main>
    const mainOverflowLocked = await page.evaluate(() => {
      const mainEl = document.querySelector("main");
      return mainEl ? mainEl.style.overflow : null;
    });
    expect(mainOverflowLocked).toBe("hidden");

    // 5. Cierre mediante botón de cerrar y restauración de scroll
    const closeBtn = drawer.locator("button[aria-label='Cerrar panel']");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(drawer).toHaveClass(/translate-x-full/);

    const mainOverflowRestored = await page.evaluate(() => {
      const mainEl = document.querySelector("main");
      return mainEl ? mainEl.style.overflow : null;
    });
    expect(mainOverflowRestored).not.toBe("hidden");
  });

  test("Tier 3 & R2: Ausencia de tooltips en tarjetas de nodos de la estructura", async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);

    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/oficinas/estructura");

    await expect(page.locator("svg[data-tree-canvas]")).toBeVisible({ timeout: 15000 });

    // Verificar tarjetas de nodo: ninguna debe tener clase .tooltip ni data-tip sobre el nombre
    const nodeNames = page.locator("[data-node-id] .line-clamp-2");
    const count = await nodeNames.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const nodeEl = nodeNames.nth(i);
      const parentWithTooltip = await nodeEl.evaluate((el) => {
        const closestTooltip = el.closest(".tooltip");
        const hasDataTip = el.hasAttribute("data-tip") || el.getAttribute("title");
        return Boolean(closestTooltip || hasDataTip);
      });
      expect(parentWithTooltip, "Nombre de nodo no debe poseer tooltip ni data-tip").toBe(false);
    }
  });

  test("el botón de CTA en el directorio redirige correctamente a la estructura", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/oficinas");
    await page
      .locator('summary[aria-label="Más acciones del directorio"]')
      .click();

    const ctaButton = page.locator("[data-cta-estructura-oficinas]");
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();

    await page.waitForURL("**/oficinas/estructura");
    await expect(page.locator("h1")).toContainText("Estructura de Red Postal");
  });
});
