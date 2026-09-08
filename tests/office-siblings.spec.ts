import { test, expect } from "@playwright/test";

test.describe("Oficinas en el mismo edificio", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("shows sibling mini cards when an office shares address/region/province", async ({
    page,
  }) => {
    await page.goto("/oficinas");

    await page.waitForSelector("[data-office-id]", { timeout: 15000 });

    const siblingSection = page.locator("[data-sibling-office]").first();

    const count = await siblingSection.count();
    test.skip(count === 0, "No shared-address offices in the current DB");

    // The sibling section lives inside the collapsed detail panel.
    // Expand the row that contains it so the cards are actually visible.
    const article = page
      .locator("[data-master-detail-sort-item]:has([data-sibling-office])")
      .first();
    await article.locator("[data-chevron-toggle]").click();

    await expect(siblingSection).toBeVisible();
    const code = await siblingSection.getAttribute("data-sibling-code");
    expect(code).toBeTruthy();

    const copyControl = siblingSection.locator("[data-copy-control]");
    await expect(copyControl).toHaveAttribute("data-copy-value", code!);
  });

  test("copying a sibling NIS copies the correct value", async ({ page }) => {
    await page.goto("/oficinas");
    await page.waitForSelector("[data-office-id]", { timeout: 15000 });

    const siblingSection = page.locator("[data-sibling-office]").first();
    test.skip(
      (await siblingSection.count()) === 0,
      "No shared-address offices in the current DB",
    );

    // Expand the row that contains the sibling section before interacting.
    const article = page
      .locator("[data-master-detail-sort-item]:has([data-sibling-office])")
      .first();
    await article.locator("[data-chevron-toggle]").click();

    const code = (await siblingSection.getAttribute("data-sibling-code"))!;
    const copyControl = siblingSection.locator("[data-copy-control]");

    await copyControl.click();

    // The feedbackOnly CopyButton shows the toast only after the clipboard
    // write succeeded, so it is a reliable barrier before reading the value.
    const toastContainer = page.locator("#global-toast-container");
    await expect(toastContainer).toContainText(
      `NIS ${code} copiado al portapapeles`,
    );

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(code);
  });

  test("directory renders data-sibling-code on sibling cards", async ({
    page,
  }) => {
    await page.goto("/oficinas");
    await page.waitForSelector("[data-office-id]", { timeout: 15000 });

    const sibling = page.locator("[data-sibling-office]").first();
    test.skip(
      (await sibling.count()) === 0,
      "No shared-address offices in the current DB",
    );
    await expect(sibling).toHaveAttribute("data-sibling-code", /.+/);
  });
});
