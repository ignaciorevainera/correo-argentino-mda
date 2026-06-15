import { chromium } from "playwright";
import assert from "node:assert/strict";

async function runTest() {
  console.log("Iniciando navegador Chromium...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Registrar llamadas a la API
  const apiCalls = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/terminals")) {
      apiCalls.push(req.url());
    }
  });

  console.log("Navegando a la página de inventario...");
  await page.goto("http://localhost:4321/inventario-equipos");
  await page.waitForLoadState("networkidle");

  // Verificar que la tabla cargó registros
  let rows = await page.locator("[data-terminal-row]").all();
  console.log(`Filas iniciales cargadas: ${rows.length}`);
  assert.ok(rows.length > 0, "Debería haber terminales cargadas inicialmente");

  // 1. Probar Filtro de SO
  console.log("Probando filtro de sistema operativo (Windows 10)...");
  await page.selectOption("#filter-os", "win10");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000); // Dar tiempo para actualizar el DOM

  // Verificar selector de variantes habilitado
  const isVariantDisabled = await page.locator("#filter-os-variant").getAttribute("disabled");
  assert.equal(isVariantDisabled, null, "El selector de variantes debería estar habilitado al elegir Windows 10");
  console.log("Selector de variantes habilitado correctamente.");

  // 2. Probar Filtro de Arquitectura
  console.log("Probando filtro de arquitectura (64 bits)...");
  await page.selectOption("#filter-arch", "64 bits");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // 3. Probar Filtro de Marca
  console.log("Probando filtro de marca (Dell)...");
  await page.selectOption("#filter-brand", "dell");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // 4. Probar Filtro de RAM
  console.log("Probando filtro de RAM (Todas)...");
  await page.selectOption("#filter-ram", "all");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // 5. Probar Ordenamiento
  console.log("Probando ordenamiento por Hostname...");
  const hostnameHeaderButton = page.locator("#table-terminales button[data-table-sort-key='hostname']");
  await hostnameHeaderButton.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // Verificar que se haya hecho la petición de ordenamiento con sortBy=hostname
  console.log("Urls llamadas:");
  console.log(apiCalls);
  const hasSortCall = apiCalls.some(url => url.includes("sortBy=hostname"));
  assert.ok(hasSortCall, "Debería haberse realizado una llamada a la API con ordenamiento por hostname");

  // 6. Probar Búsqueda por Subcadena (TDD FTS5 Trigram)
  console.log("Probando búsqueda por subcadena parcial ('zabw')...");
  await page.locator("#btn-clear-filters-terminales").click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  await page.locator("#terminal-search").focus();
  await page.locator("#terminal-search").fill("");
  await page.locator("#terminal-search").pressSequentially("zabw", { delay: 100 });
  await page.waitForTimeout(2000); // Dar tiempo al debounce de 300ms y a la llamada de red

  console.log("Urls llamadas después de buscar:");
  console.log(apiCalls);

  let searchRows = await page.locator("[data-terminal-row]").all();
  console.log(`Filas encontradas para 'zabw': ${searchRows.length}`);
  assert.ok(searchRows.length > 0, "Debería haber al menos un resultado al buscar por infijo 'zabw'");
  const firstRowText = await searchRows[0].innerText();
  assert.ok(firstRowText.includes("1428ZABW0001") || firstRowText.includes("ZABW"), "El resultado debería incluir la terminal con ZABW");

  // También probamos buscar "308" para encontrar "A0000308"
  console.log("Probando búsqueda por subcadena parcial ('308')...");
  await page.locator("#btn-clear-filters-terminales").click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  await page.locator("#terminal-search").focus();
  await page.locator("#terminal-search").fill("");
  await page.locator("#terminal-search").pressSequentially("308", { delay: 100 });
  await page.waitForTimeout(2000);

  let searchRows308 = await page.locator("[data-terminal-row]").all();
  console.log(`Filas encontradas para '308': ${searchRows308.length}`);
  assert.ok(searchRows308.length > 0, "Debería haber al menos un resultado al buscar por infijo '308'");
  const text308 = await searchRows308[0].innerText();
  assert.ok(text308.includes("A0000308"), "Debería encontrar la terminal A0000308");

  console.log("Todas las verificaciones de filtros y ordenamiento han pasado correctamente.");
  await browser.close();
}

runTest().catch((err) => {
  console.error("Prueba fallida:", err);
  process.exit(1);
});
