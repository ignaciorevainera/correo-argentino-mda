import { test, expect } from "@playwright/test";

test.describe("Terminal row copy button", () => {
  test("clicking the icon copy button copies the formatted terminal block", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto("/inventario-terminales");
    await page.waitForSelector("[data-terminal-row]");

    const row = page.locator("[data-terminal-row]").first();
    const copyBtn = row.locator("[data-copy-control]").first();
    await row.hover();
    await expect(copyBtn).toBeVisible();

    const expected = (await copyBtn.getAttribute("data-copy-value")) ?? "";
    expect(expected.length).toBeGreaterThan(0);

    await copyBtn.click();

    const clipboard = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    // Windows normalizes clipboard text to CRLF; compare on LF.
    expect(clipboard.replace(/\r\n/g, "\n")).toBe(expected);

    const hostname = (await row.getAttribute("data-hostname")) ?? "";
    const ip = (await row.getAttribute("data-ip")) ?? "";

    expect(expected).toContain(`Hostname: ${hostname}`);
    expect(expected).toContain(`Dirección IPv4: ${ip}`);
    expect(expected).toContain("Marca:");
    expect(expected).toContain("Modelo:");
    expect(expected).toContain("SN:");
    expect(expected).toMatch(/Dirección IPv4: .+\n\nMarca: /);
  });

  test("copy button shows a tooltip explaining it copies the equipment data", async ({
    page,
  }) => {
    await page.goto("/inventario-terminales");
    await page.waitForSelector("[data-terminal-row]");

    const copyBtn = page
      .locator("[data-terminal-row] [data-copy-control]")
      .first();
    await expect(copyBtn).toBeVisible();

    const tooltip = copyBtn.locator(
      "xpath=ancestor::div[contains(@class,'tooltip')]//*[contains(@class,'tooltip-content')]",
    );
    await expect(tooltip).toContainText("Copiar datos del equipo");
  });
});
