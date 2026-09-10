import { test, expect } from "@playwright/test";

test("only a single svg icon is declared", async ({ page }) => {
  await page.goto("/login");

  const icons = page.locator('link[rel="icon"]');
  await expect(icons).toHaveCount(1);
  await expect(icons.first()).toHaveAttribute("type", "image/svg+xml");

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(0);
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveCount(0);
});
