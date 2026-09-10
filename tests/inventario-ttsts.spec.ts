import { test, expect } from "@playwright/test";

test.describe("Inventario T&T & STS", () => {
  test("el tab T&T & STS aparece después de Mediterránea", async ({
    page,
  }) => {
    await page.goto("/inventario-terminales");
    await page.waitForSelector("#inventory-view-switcher");

    const labels = await page.$$eval(
      "#inventory-view-switcher input[type='radio']",
      (els) => els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
    const idxTT = labels.indexOf("T&T & STS");
    const idxMedi = labels.indexOf("Mediterránea");

    expect(idxTT).toBeGreaterThan(-1);
    expect(idxTT).toBeGreaterThan(idxMedi);
  });

  test("switch al tab carga grupos con masters y pares válidos", async ({
    page,
  }) => {
    await page.goto("/inventario-terminales");
    await page.getByRole("radio", { name: "T&T & STS" }).check();

    await page.waitForSelector("#view-ttsts:not(.hidden)");
    await page
      .waitForSelector(
        "#table-ttsts-body [data-terminal-row], #no-results-state-ttsts:not(.hidden)",
      )
      .catch(() => {});

    const container = page.locator("#table-ttsts-body");
    if ((await container.locator("[data-terminal-row]").count()) === 0) {
      await expect(page.locator("#no-results-state-ttsts")).toBeVisible();
      return;
    }

    const vmRows = container.locator("[data-tt-vm-row]");
    const vmCount = await vmRows.count();
    for (let i = 0; i < vmCount; i++) {
      const prevSibling = vmRows.nth(i).locator(
        "xpath=preceding-sibling::*[1][self::article][@data-terminal-row and not(@data-tt-vm-row)]",
      );
      await expect(prevSibling).toHaveCount(1);
    }
  });

  test("equipo sin VM muestra badge Sin VM", async ({ page }) => {
    await page.goto("/inventario-terminales");
    await page.getByRole("radio", { name: "T&T & STS" }).check();
    await page
      .waitForSelector(
        "#table-ttsts-body [data-terminal-row], #no-results-state-ttsts:not(.hidden)",
      )
      .catch(() => {});

    const badges = page.locator(
      "#table-ttsts-body [data-terminal-row]:not([data-tt-vm-row]) .badge",
    );
    const sinVmBadge = badges.filter({ hasText: "Sin VM" });
    if (await sinVmBadge.count()) {
      const badgeClass = await sinVmBadge.first().getAttribute("class");
      expect(badgeClass).toContain("badge-error");
    }
    // Si el badge Sin VM no aparece, no hay filas T&T sin VM en la página.
  });

  test("el filtro Solo T&T aplica el param ttType=tyt", async ({ page }) => {
    await page.goto("/inventario-terminales");
    await page.getByRole("radio", { name: "T&T & STS" }).check();
    await page.waitForSelector("#view-ttsts:not(.hidden)");

    const initialCount = await page
      .locator("#table-ttsts-body [data-terminal-row]")
      .count();

    await page.getByRole("radio", { name: "Solo T&T" }).check();
    await page.waitForTimeout(500);

    const params = new URL(page.url()).searchParams;
    expect(params.get("ttType")).toBe("tyt");

    const filteredCount = await page
      .locator("#table-ttsts-body [data-terminal-row]")
      .count();
    if (initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test("el filtro Con/Sin VM solo aparece con Solo T&T y aplica vmFilter", async ({
    page,
  }) => {
    await page.goto("/inventario-terminales");
    await page.getByRole("radio", { name: "T&T & STS" }).check();
    await page.waitForSelector("#view-ttsts:not(.hidden)");

    const wrapper = page.locator("#tt-vm-filter-wrapper");
    await expect(wrapper).toBeHidden();

    await page.getByRole("radio", { name: "Solo T&T" }).check();
    await page.waitForTimeout(500);
    await expect(wrapper).toBeVisible();

    await page.getByRole("radio", { name: "Sin VM" }).check();
    await page.waitForTimeout(500);

    const params = new URL(page.url()).searchParams;
    expect(params.get("vmFilter")).toBe("without");
  });

  test("el banner colapsable abre y cierra", async ({ page }) => {
    await page.goto("/inventario-terminales");
    await page.getByRole("radio", { name: "T&T & STS" }).check();
    await page.waitForSelector("#view-ttsts:not(.hidden)");

    const banner = page.locator("#view-ttsts .collapse").first();
    const title = banner.locator(".collapse-title");
    const content = banner.locator(".collapse-content");

    // DaisyUI .collapse overlays an invisible checkbox that intercepts the
    // title click, so the synthetic click needs force:true.
    await title.click({ force: true });
    await expect(content).toBeVisible();

    await title.click({ force: true });
    await expect(content).toBeHidden();
  });

  test("la búsqueda sin resultados muestra empty state y limpiar restaura", async ({
    page,
  }) => {
    await page.goto("/inventario-terminales");
    await page.getByRole("radio", { name: "T&T & STS" }).check();
    await page.waitForSelector("#view-ttsts:not(.hidden)");

    await page.fill("#tt-search", "zzzqqqxxx-no-existe");

    await expect(page.locator("#no-results-state-ttsts")).toBeVisible();

    await page.click("#btn-clear-empty-ttsts");
    await expect(page.locator("#no-results-state-ttsts")).toBeHidden();
  });

  test("la API expone X-Total-Count numérico para isTT", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/terminals?isTT=true&page=1&limit=5",
    );
    expect(response.status()).toBe(200);
    const totalCount = response.headers()["x-total-count"];
    expect(Number(totalCount)).not.toBeNaN();
  });
});
