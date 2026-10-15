import "dotenv/config";
import { expect, test } from "@playwright/test";
import { setSessionCookie } from "./helpers/auth";
import { KbTestFixture, type KbTestMesa } from "./helpers/kb";

let fixture: KbTestFixture;
let mesa: KbTestMesa;

test.beforeEach(async () => {
  fixture = new KbTestFixture();
  mesa = await fixture.createMesa();
});

test.afterEach(async () => {
  await fixture.cleanup();
});

test("el editor se renderiza en create sin errores ni assets rotos", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);

  const pageErrors: string[] = [];
  const brokenAssets: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/_astro/")) {
      brokenAssets.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto("/base-conocimiento/create");
  expect(response?.status()).toBe(200);

  await expect(page.locator(".EasyMDEContainer")).toBeVisible();
  await expect(page.locator(".EasyMDEContainer .CodeMirror")).toBeVisible();
  await expect(page.locator(".editor-toolbar")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(brokenAssets).toEqual([]);
});

test("si el script del editor no carga, la textarea queda visible y editable", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  // Aborta el request del script del editor en ambos harness: build
  // (`/_astro/KbEditor.astro_astro_type_script_index_0_lang.<hash>.js`) y dev
  // (`/src/components/base-conocimiento/KbEditor.astro?astro&type=script...`).
  await page.route(
    (url) => /KbEditor\.astro/.test(url.pathname + url.search),
    (route) => route.abort(),
  );

  const response = await page.goto("/base-conocimiento/create");
  expect(response?.status()).toBe(200);

  const source = page.locator('textarea[data-kb-source]');
  await expect(source).toBeVisible();
  await expect(page.locator(".EasyMDEContainer")).toHaveCount(0);

  await source.fill("contenido sin editor");
  await expect(source).toHaveValue("contenido sin editor");
});
