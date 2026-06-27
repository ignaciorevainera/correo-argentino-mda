import { chromium } from "playwright";
import assert from "node:assert/strict";

async function runTest() {
  console.log("Iniciando navegador Chromium...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Navegando a la página de inventario...");
  await page.goto("http://localhost:4321/inventario-terminales");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  async function isOptionDisabled(text) {
    return page.evaluate((t) => {
      const select = document.getElementById("filter-model");
      if (!select) return true;
      const options = Array.from(select.options);
      const opt = options.find((o) => o.text.trim() === t);
      return opt ? opt.disabled : true;
    }, text);
  }

  async function getOptionBrand(text) {
    return page.evaluate((t) => {
      const select = document.getElementById("filter-model");
      if (!select) return null;
      const options = Array.from(select.options);
      const opt = options.find((o) => o.text.trim() === t);
      return opt ? opt.getAttribute("data-brand") : null;
    }, text);
  }

  const dellModel = "OptiPlex 3000";
  const hpModel = "HP EliteBook 840 G3";

  // 1. Verificar data-brand existe en las opciones
  console.log("Verificando que las opciones tengan data-brand...");
  const brandAttr = await getOptionBrand(dellModel);
  assert.ok(brandAttr, `data-brand debería existir en "${dellModel}"`);
  console.log(`data-brand para "${dellModel}": ${brandAttr}`);

  // 2. Estado inicial: todas las opciones habilitadas
  console.log("Verificando estado inicial (todos habilitados)...");
  assert.equal(
    await isOptionDisabled(dellModel),
    false,
    `"${dellModel}" debería estar habilitado inicialmente`,
  );
  assert.equal(
    await isOptionDisabled(hpModel),
    false,
    `"${hpModel}" debería estar habilitado inicialmente`,
  );

  // 3. Seleccionar marca Dell
  console.log("Seleccionando marca Dell...");
  await page.selectOption("#filter-brand", "dell");
  await page.waitForTimeout(500);

  assert.equal(
    await isOptionDisabled(dellModel),
    false,
    `"${dellModel}" debería estar habilitado con marca Dell`,
  );
  assert.equal(
    await isOptionDisabled(hpModel),
    true,
    `"${hpModel}" debería estar deshabilitado con marca Dell`,
  );
  console.log("Filtro Dell funciona correctamente.");

  // 4. Seleccionar marca HP
  console.log("Seleccionando marca HP...");
  await page.selectOption("#filter-brand", "hp");
  await page.waitForTimeout(500);

  assert.equal(
    await isOptionDisabled(hpModel),
    false,
    `"${hpModel}" debería estar habilitado con marca HP`,
  );
  assert.equal(
    await isOptionDisabled(dellModel),
    true,
    `"${dellModel}" debería estar deshabilitado con marca HP`,
  );
  console.log("Filtro HP funciona correctamente.");

  // 5. Restablecer a "Todas las marcas"
  console.log("Restableciendo a 'Todas las marcas'...");
  await page.selectOption("#filter-brand", "all");
  await page.waitForTimeout(500);

  assert.equal(
    await isOptionDisabled(dellModel),
    false,
    `"${dellModel}" debería estar habilitado con marca Todas`,
  );
  assert.equal(
    await isOptionDisabled(hpModel),
    false,
    `"${hpModel}" debería estar habilitado con marca Todas`,
  );
  console.log("Restablecimiento funciona correctamente.");

  console.log(
    "Todas las verificaciones de dropdown dependiente pasaron correctamente.",
  );
  await browser.close();
}

runTest().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
