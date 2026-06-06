# Plan de Implementación de Pruebas de Filtros y Ordenamiento de Terminales

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escribir un script de prueba usando Playwright que valide de forma exhaustiva el funcionamiento dinámico de todos los filtros y el ordenamiento de la tabla de inventario de terminales contra el servidor local.

**Architecture:** El script arrancará el servidor Astro, usará Playwright para navegar a la página de inventario, seleccionará filtros uno a uno (incluyendo los dependientes como variante de SO), validará los cambios en las filas mostradas, pulsará cabeceras de columnas para ordenar en sentido ascendente y descendente, y verificará que las peticiones HTTP a la API contengan los parámetros correctos.

**Tech Stack:** Node.js, Playwright, ESM.

---

### Task 1: Crear el Script de Pruebas de Filtros y Ordenamiento

**Files:**
- Create: `tests/filter-inventory.test.mjs`

- [ ] **Step 1: Crear el script de prueba**

Escribir el código en `tests/filter-inventory.test.mjs` que realice las siguientes acciones:
1. Iniciar un navegador Chromium headless usando Playwright.
2. Navegar a `http://localhost:4321/inventario-equipos`.
3. Interceptar las peticiones a `/api/terminals*` para verificar los parámetros de consulta (`os`, `osVariant`, `architecture`, `brand`, `ram`, `status`, `sortBy`, `sortOrder`).
4. Probar la alternancia de filtros:
   - Filtro de SO (e.g., seleccionar `win10` y comprobar que el selector de variante se habilite y cargue las opciones).
   - Filtrar por una variante específica.
   - Filtrar por Arquitectura (64 bits, 32 bits).
   - Filtrar por Marca (Dell, Lenovo, etc.).
   - Filtrar por RAM (`<=1gb`, etc.).
   - Filtrar por Estado (Online, Offline).
5. Probar el ordenamiento al hacer clic en las cabeceras de columnas (Hostname, Hardware, Sistema operativo, Ubicación).
6. Cerrar el navegador.

```javascript
import { chromium } from "playwright";
import assert from "node:assert/strict";

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.new_page();
  
  // Registrar llamadas a la API
  const apiCalls = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/terminals")) {
      apiCalls.push(req.url());
    }
  });

  console.log("Navegando a la página de inventario...");
  await page.goto("http://localhost:4321/inventario-equipos");
  await page.wait_for_load_state("networkidle");

  // Verificar que la tabla cargó registros
  const rows = await page.locator("[data-terminal-row]").all();
  console.log(`Filas iniciales cargadas: ${rows.length}`);
  assert.ok(rows.length > 0, "Debería haber terminales cargadas inicialmente");

  // 1. Probar Filtro de SO
  console.log("Probando filtro de sistema operativo...");
  await page.selectOption("#filter-os", "win10");
  await page.wait_for_load_state("networkidle");
  await page.wait_for_timeout(500); // Esperar renderizado y actualización

  // Verificar selector de variantes habilitado
  const isVariantDisabled = await page.locator("#filter-os-variant").getAttribute("disabled");
  assert.equal(isVariantDisabled, null, "El selector de variantes debería estar habilitado al elegir Windows 10");

  // 2. Probar Filtro de Arquitectura
  console.log("Probando filtro de arquitectura...");
  await page.selectOption("#filter-arch", "64 bits");
  await page.wait_for_load_state("networkidle");
  await page.wait_for_timeout(500);

  // 3. Probar Filtro de Marca
  console.log("Probando filtro de marca...");
  await page.selectOption("#filter-brand", "dell");
  await page.wait_for_load_state("networkidle");
  await page.wait_for_timeout(500);

  // 4. Probar Filtro de RAM
  console.log("Probando filtro de RAM...");
  await page.selectOption("#filter-ram", "<=1gb");
  await page.wait_for_load_state("networkidle");
  await page.wait_for_timeout(500);

  // 5. Probar Ordenamiento
  console.log("Probando ordenamiento por Hostname...");
  const hostnameHeader = page.locator("button[data-table-sort-key='hostname']");
  await hostnameHeader.click();
  await page.wait_for_load_state("networkidle");
  await page.wait_for_timeout(500);

  // Verificar que se haya hecho la petición de ordenamiento con sortBy=hostname
  const hasSortCall = apiCalls.some(url => url.includes("sortBy=hostname"));
  assert.ok(hasSortCall, "Debería haberse realizado una llamada a la API con ordenamiento por hostname");

  console.log("Todas las verificaciones de filtros y ordenamiento han pasado correctamente.");
  await browser.close();
}

runTest().catch((err) => {
  console.error("Prueba fallida:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Ejecutar el script contra el servidor local**

Ejecutar el script usando Node.js:
`node tests/filter-inventory.test.mjs`
y verificar que finalice con éxito.
