import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { agents } from "../../src/db/schema";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

const MDA_TI_MESA = "TI_GSM_MDA TI";

let admin: TestUser;

/**
 * Errores de red (5xx) y de JS en la pagina. Un boton que "deja de
 * funcionar" casi siempre se manifiesta aqui: fetch que vuelve 500 o
 * excepcion no capturada al ejecutar el handler.
 */
function watchFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 500) failures.push(`HTTP ${res.status()} ${res.url()}`);
  });
  page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
  return failures;
}

test.beforeAll(async () => {
  admin = await createTestUserAndSession("admin", { helpdeskName: MDA_TI_MESA });
});

test.afterAll(async () => {
  if (admin) {
    await cleanupTestUser(admin.userId, admin.sessionId);
  }
});

test.describe("Botones de supervision siguen operativos", () => {
  test("asistencia: buscar, ordenar, expandir fila, exportar y navegar a estadisticas", async ({
    page,
    context,
  }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/asistencia");

    const rows = page.locator(".main-attendance-row");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const totalRows = await rows.count();
    expect(totalRows).toBeGreaterThan(0);

    // Buscador: un texto imposible deja la tabla sin filas.
    const search = page.locator('input[data-search-input="operator-search"]');
    await expect(search).toBeVisible();
    await search.fill("zzz-no-existe-zzz");
    await expect(rows).toHaveCount(0);
    await search.fill("");
    await expect(rows).toHaveCount(totalRows);

    // Orden: el menu guarda el criterio en localStorage. El menu vive en un
    // <details>, hay que abrirlo antes de poder pulsar el criterio.
    await page.locator("#current-sort-label").click();
    await page.locator("#sort-menu button[data-sort='alpha-desc']").click();
    expect(await page.evaluate(() => localStorage.getItem("asistenciaActiveSort"))).toBe(
      "alpha-desc",
    );

    // Fila expandible: el detalle de la primera fila se despliega.
    const firstRowId = await rows.first().getAttribute("data-row-id");
    expect(firstRowId).toBeTruthy();
    await page.locator(".toggle-row-btn").first().click();
    await expect(page.locator(`#details-row-${firstRowId}`)).toBeVisible();

    // Exportar CSV: descarga real, no un boton muerto.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-csv-btn").click(),
    ]);
    expect(download.suggestedFilename()).toContain("asistencia");

    // Enlace a estadisticas: navega a la pagina correcta.
    await page.locator("a[href$='supervision/asistencia/estadisticas']").click();
    await page.waitForURL(/supervision\/asistencia\/estadisticas/);
    expect(new URL(page.url()).pathname).toBe("/supervision/asistencia/estadisticas");

    expect(failures).toEqual([]);
  });

  test("asistencia estadisticas: filtrar operadores y abrir/cerrar la ficha", async ({
    page,
    context,
  }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/asistencia/estadisticas");

    const cards = page.locator(".operator-mini-card");
    const totalCards = await cards.count();
    test.skip(totalCards === 0, "sin datos de asistencias para el periodo");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    const search = page.locator("#operator-search-input");
    await expect(search).toBeVisible();
    // El filtro oculta tarjetas, no las borra del DOM: se cuenta lo visible.
    await search.fill("zzz-no-existe-zzz");
    await expect(page.locator(".operator-mini-card:visible")).toHaveCount(0);
    await search.fill("");
    await expect(page.locator(".operator-mini-card:visible")).toHaveCount(totalCards);

    // La tarjeta abre el detalle del operador y el boton vuelve al grid.
    await cards.first().click();
    await expect(page.locator("#operator-detail-view")).toBeVisible();
    await page.locator("#op-back-to-grid-btn").click();
    await expect(page.locator("#operator-grid-view")).toBeVisible();

    expect(failures).toEqual([]);
  });

  test("ficha de operador: cambiar de vista y abrir el buscador de operadores", async ({
    page,
    context,
  }) => {
    const failures = watchFailures(page);
    const [agent] = await db.select({ id: agents.id }).from(agents).limit(1);
    test.skip(!agent, "la base no tiene agentes");

    await setSessionCookie(context, admin.signedSessionId);
    await page.goto(`/supervision/asistencia/operador/${agent.id}`);

    await page.locator("#view-annual-btn").click();
    await expect(page.locator("#annual-view-container")).toBeVisible();
    await page.locator("#view-table-btn").click();
    await expect(page.locator("#table-view-container")).toBeVisible();
    await page.locator("#view-monthly-btn").click();
    await expect(page.locator("#calendar-view-container")).toBeVisible();

    // Exportar CSV: descarga si hay datos del operador; si no hay, el boton
    // debe avisarlo. Lo que no puede pasar es que no haga nada.
    const downloadP = page
      .waitForEvent("download", { timeout: 6_000 })
      .then((d) => d)
      .catch(() => null);
    const toastP = page
      .locator("#global-toast-container")
      .filter({ hasText: /datos cargados|descargado/ })
      .waitFor({ timeout: 6_000 })
      .then(() => "toast")
      .catch(() => null);

    await page.locator("#export-csv-btn").click();

    const [download, toast] = await Promise.all([downloadP, toastP]);
    expect(download ?? toast, "el boton Exportar CSV no descargo ni aviso").toBeTruthy();
    if (download) expect(download.suggestedFilename()).toContain(".csv");

    // El desplegable del buscador se abre sobre el contenido: se prueba al
    // final para no tapar el resto de los controles.
    await page.locator("#operator-combobox-input").click();
    await expect(page.locator("#operator-combobox-dropdown")).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("cronograma: el switch de vistas muestra el panel correcto", async ({ page, context }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/cronograma");

    await expect(page.locator("#monthly-view")).toBeVisible({ timeout: 20_000 });

    await page.locator("#switch-to-daily-btn").click();
    await expect(page.locator("#daily-view")).toBeVisible();

    await page.locator("#switch-to-groups-btn").click();
    await expect(page.locator("#groups-view")).toBeVisible();

    await page.locator("#switch-to-overtime-btn").click();
    await expect(page.locator("#overtime-view")).toBeVisible({ timeout: 20_000 });

    await page.locator("#switch-to-pasiva-btn").click();
    await expect(page.locator("#pasiva-view")).toBeVisible({ timeout: 20_000 });

    await page.locator("#switch-to-monthly-btn").click();
    await expect(page.locator("#monthly-view")).toBeVisible();

    expect(failures).toEqual([]);
  });

  test("cronograma: agregar mes abre el modal y editar activa la barra de edicion", async ({
    page,
    context,
  }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/cronograma");

    await page.locator("#add-month-btn").click();
    await expect(page.locator("#new-month-modal")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator("#toggle-edit-mode-btn").click();
    await expect(page.locator("#edit-mode-toolbar")).toBeVisible();
    // La barra ofrece guardar/descartar; con nada pendiente el boton de
    // descartar queda deshabilitado, asi que solo se verifica que existe.
    await expect(page.locator("#save-edits-btn")).toBeVisible();
    await expect(page.locator("#discard-edits-btn")).toBeVisible();

    expect(failures).toEqual([]);
  });

  test("calidad: parametros, ficha de operador y nueva auditoria", async ({ page, context }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/calidad-operadores");

    await expect(page.locator("#operators-sort-root")).toBeVisible({ timeout: 20_000 });

    // Parametros: abre y cierra el modal (no se guarda nada).
    await page.locator("#btn-configure-parameters").click();
    await expect(page.locator("#parameters-modal")).toBeVisible();
    await page.locator("#btn-close-parameters-modal").click();
    await expect(page.locator("#parameters-modal")).toBeHidden();

    // Ficha del operador: la tarjeta abre el modal de detalle.
    const cards = page.locator(".operator-card");
    const totalCards = await cards.count();
    if (totalCards > 0) {
      const search = page.locator('input[data-search-input="operator-search"]');
      await search.fill("zzz-no-existe-zzz");
      await expect(page.locator(".operator-card:visible")).toHaveCount(0);
      await search.fill("");
      await expect(page.locator(".operator-card:visible")).toHaveCount(totalCards);

      await cards.first().click();
      await expect(page.locator("#operator-details-modal")).toBeVisible();
      // El modal tapa la pagina: se cierra antes de seguir.
      await page.keyboard.press("Escape");
      await expect(page.locator("#operator-details-modal")).toBeHidden();
    }

    // Nueva auditoria: navega al formulario.
    await page.locator("#btn-top-new-audit").click();
    await page.waitForURL(/supervision\/calidad-operadores\/nueva/);
    expect(new URL(page.url()).pathname).toBe("/supervision/calidad-operadores/nueva");

    expect(failures).toEqual([]);
  });

  test("nueva auditoria: el formulario carga y el selector de canal responde", async ({
    page,
    context,
  }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/calidad-operadores/nueva");

    await expect(page.locator("#audit-form")).toBeVisible({ timeout: 20_000 });

    // Conmutador de canales: el boton activo escribe el canal en el input
    // oculto que viaja en el POST del formulario.
    const channelButtons = page.locator("#channel-selector-join .channel-btn");
    await expect(channelButtons).toHaveCount(3);
    await page.locator(".channel-btn[data-channel='wise_email']").click();
    await expect(page.locator("#form-channel-type")).toHaveValue("wise_email");
    await page.locator(".channel-btn[data-channel='invgate_ticket']").click();
    await expect(page.locator("#form-channel-type")).toHaveValue("invgate_ticket");

    expect(failures).toEqual([]);
  });

  test("metricas de autogestiones: los presets filtran y refrescan", async ({ page, context }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/autogestiones-metricas");

    await expect(page.locator("#presets-filter-bar")).toBeVisible({ timeout: 20_000 });

    const [resPreset] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("api/autogestion/metricas") && r.url().includes("preset=ayer"),
      ),
      page.locator("#presets-filter-bar button[data-preset='ayer']").click(),
    ]);
    expect(resPreset.status()).toBe(200);

    const [resRefresh] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("api/autogestion/metricas")),
      page.locator("#btn-refresh-metrics").click(),
    ]);
    expect(resRefresh.status()).toBe(200);

    // Rango personalizado: dispara preset=custom.
    await page.locator("#filter-date-from").fill("2026-01-01");
    await page.locator("#filter-date-to").fill("2026-01-31");
    const [resCustom] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("api/autogestion/metricas") && r.url().includes("preset=custom"),
      ),
      page.locator("#btn-apply-custom-dates").click(),
    ]);
    expect(resCustom.status()).toBe(200);

    // Exportar CSV: el enlace apunta al endpoint de exportacion.
    const href = await page.locator("#btn-export-csv").getAttribute("href");
    expect(href).toContain("api/autogestion/metricas/export.csv");

    expect(failures).toEqual([]);
  });

  test("asignacion de autogestiones: las pestañas muestran el panel correcto", async ({
    page,
    context,
  }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/asignacion-autogestiones");

    await expect(page.locator("#tab-btn-asignacion")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#panel-asignacion")).toBeVisible();

    await page.locator("#tab-btn-automatizacion").click();
    await expect(page.locator("#panel-automatizacion")).toBeVisible();
    await expect(page.locator("#panel-asignacion")).toBeHidden();
    expect(page.url()).toContain("tab=automatizacion");

    await page.locator("#tab-btn-monitoreo").click();
    await expect(page.locator("#panel-monitoreo")).toBeVisible();
    await expect(page.locator("#panel-automatizacion")).toBeHidden();

    await page.locator("#tab-btn-asignacion").click();
    await expect(page.locator("#panel-asignacion")).toBeVisible();
    await expect(page.locator("#panel-monitoreo")).toBeHidden();

    expect(failures).toEqual([]);
  });

  test("asignacion: una tarjeta de ticket abre el detalle", async ({ page, context }) => {
    const failures = watchFailures(page);
    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/supervision/asignacion-autogestiones");

    await expect(page.locator("#tab-btn-asignacion")).toBeVisible({ timeout: 20_000 });
    const ticket = page.locator("[data-ticket-id]").first();
    test.skip((await ticket.count()) === 0, "no hay tickets sin asignar para abrir");

    await ticket.click();
    await expect(page.locator("#modal-ticket-detail")).toBeVisible();

    expect(failures).toEqual([]);
  });
});
