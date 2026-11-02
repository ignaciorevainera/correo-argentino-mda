import "dotenv/config";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  createTestUserAndSession,
  setSessionCookie,
  cleanupTestUser,
  type TestUser,
} from "../helpers/auth";

test.describe("Changelog / Novedades del Portal", () => {
  let testUser: TestUser;
  const fixtureDate = "2099-12-31";
  const fixturePath = path.resolve(process.cwd(), `src/config/changelog/_e2e-fixture-${fixtureDate}.md`);

  test.beforeAll(async () => {
    testUser = await createTestUserAndSession("agent");

    // Crear un changelog de prueba activo (sin draft) para el spec con fecha lejana
    await fs.promises.writeFile(
      fixturePath,
      `---
title: "Actualización Operativa E2E"
date: "${fixtureDate}"
version: "v2.0.0"
highlights: "Novedades probadas de forma automatizada con Playwright."
commits:
  - "e2e0001"
  - "e2e0002"
---

### Nuevas Funciones
- **Buscador:** Nueva función de filtrado dinámico [\`e2e0001\`]

### Mejoras
- **Rendimiento:** Optimización de velocidad en pantalla [\`e2e0002\`]

### Correcciones
- **Interfaz:** Ajuste de diseño en encabezados
`
    );
  });

  test.beforeEach(async () => {
    test.slow();
  });

  test.afterAll(async () => {
    if (testUser) {
      await cleanupTestUser(testUser.userId);
    }
    if (fs.existsSync(fixturePath)) {
      await fs.promises.unlink(fixturePath);
    }
  });

  test("usuario anónimo es redirigido al login al acceder a /changelog", async ({ page, context }) => {
    await context.clearCookies();
    const baseURL = test.info().project.use.baseURL;
    await page.goto(`${baseURL}/changelog`);

    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test("usuario anónimo no visualiza el icono de novedades (changelog) en el navbar", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    const baseURL = test.info().project.use.baseURL;
    await page.goto(`${baseURL}/login`);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("[data-changelog-trigger]")).toHaveCount(0);
  });

  test("usuario con rol 'agent' accede a /changelog, visualiza las novedades y funciona el filtro", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, testUser.signedSessionId);
    const baseURL = test.info().project.use.baseURL;
    await page.goto(`${baseURL}/changelog`);

    await expect(page).toHaveURL(`${baseURL}/changelog`);

    // 1. Verificar encabezado y contenido principal
    await expect(page.getByRole("heading", { name: "Novedades del Portal", level: 1 })).toBeVisible();
    await expect(page.getByText("Actualización Operativa E2E")).toBeVisible();
    await expect(page.getByText("v2.0.0")).toBeVisible();

    // 1b. Verificar presencia de badges de métricas (líneas agregadas/eliminadas y horas)
    await expect(page.locator("[data-stats-additions]").first()).toBeVisible();
    await expect(page.locator("[data-stats-deletions]").first()).toBeVisible();

    // 2. Probar filtro por sección
    const filterMejorasBtn = page.locator('button[data-filter="mejoras"]');
    await expect(filterMejorasBtn).toBeVisible();
    await filterMejorasBtn.click();
    await expect(filterMejorasBtn).toHaveAttribute("aria-pressed", "true");

    // El bloque de mejoras debe ser visible
    await expect(page.locator('.changelog-section-block[data-section="mejoras"]').first()).toBeVisible();

    // El bloque de funciones debe ocultarse
    await expect(page.locator('.changelog-section-block[data-section="funciones"]').first()).toBeHidden();

    // 3. Probar buscador de texto
    const searchInput = page.locator("#changelog-search");
    await searchInput.fill("Optimización");
    await expect(page.getByText("Optimización de velocidad en pantalla")).toBeVisible();

    // Búsqueda sin coincidencias debe mostrar el Empty State
    await searchInput.fill("termino_inexistente_xyz_123");
    await expect(page.locator("#changelog-search-empty")).toBeVisible();

    // Botón restablecer búsqueda
    const resetBtn = page.locator("#changelog-clear-search-btn");
    await resetBtn.click();
    await expect(page.getByText("Actualización Operativa E2E")).toBeVisible();
  });

  test("el badge de novedades no leídas en el navbar se activa y se desactiva al ingresar a /changelog", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, testUser.signedSessionId);
    const baseURL = test.info().project.use.baseURL;

    // Simular que el usuario visitó el portal hace tiempo (fecha anterior al fixture 2026-10-25)
    await page.goto(`${baseURL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      localStorage.setItem("portal_mda_changelog_last_read", "2026-01-01");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // El badge en el navbar debe estar visible
    const badge = page.locator("[data-changelog-badge]");
    await expect(badge).toBeVisible();

    // El usuario ingresa al changelog
    await page.locator("[data-changelog-trigger]").click();
    await expect(page).toHaveURL(`${baseURL}/changelog`);
    await page.waitForLoadState("domcontentloaded");

    // Al ingresar a /changelog, se actualiza el localStorage con la fecha del fixture lejano
    const storedDate = await page.evaluate(() => localStorage.getItem("portal_mda_changelog_last_read"));
    expect(storedDate).toBe(fixtureDate);

    // Al volver al home, el badge debe estar oculto
    await page.goto(`${baseURL}/`);
    await page.waitForLoadState("domcontentloaded");
    await expect(badge).toBeHidden();
  });
});
