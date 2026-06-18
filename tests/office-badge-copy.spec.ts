import { test, expect } from "@playwright/test";

test.describe("Office badge copy behavior", () => {
  test("clicking the office code badge copies text, shows toast, and does not expand row", async ({ page }) => {
    await page.goto("/oficinas");
    await page.waitForSelector("[data-master-detail-sort-item]");

    // Find the first CopyButton inside an office master row
    const badge = page.locator("[data-office-master-row] [data-copy-control]").first();
    await expect(badge).toBeVisible();

    // Get the parent row for verifying toggle state
    const row = page.locator("[data-office-master-row]").first();
    const rowAriaExpandedBefore = await row.getAttribute("aria-expanded");

    // Click the badge to trigger copy
    await badge.click();

    // Verify toast notification appears with the copied NIS message
    const toastContainer = page.locator("#global-toast-container");
    await expect(toastContainer).toContainText(/NIS .+ copiado al portapapeles/);

    // Verify row was NOT toggled (aria-expanded unchanged)
    const rowAriaExpandedAfter = await row.getAttribute("aria-expanded");
    expect(rowAriaExpandedAfter).toBe(rowAriaExpandedBefore);

    // Toast should disappear after the 3000ms timeout
    const toast = toastContainer.locator(".alert");
    await expect(toast).toHaveCount(1);
    await page.waitForTimeout(3200);
    await expect(toast).toHaveCount(0);
  });
});
