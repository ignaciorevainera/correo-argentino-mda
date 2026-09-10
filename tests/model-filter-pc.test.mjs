import { chromium } from "playwright";
import assert from "node:assert/strict";

async function runTest() {
  console.log("Iniciando navegador Chromium...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Navegando a la página de inventario...");
  await page.goto("http://localhost:4321/inventario-terminales");
  await page.waitForLoadState("networkidle");

  console.log("Verificando que 'PC' NO esté en el dropdown de modelos...");
  const modelOptions = await page
    .locator("#filter-model option")
    .allTextContents();
  console.log("Opciones del dropdown de modelo:", modelOptions);

  const hasPcOption = modelOptions.some((opt) => opt.trim() === "PC");
  assert.equal(
    hasPcOption,
    false,
    "El dropdown de modelos no debería contener 'PC'",
  );

  console.log("Test pass: 'PC' no aparece en el dropdown de modelos.");
  await browser.close();
}

runTest().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
