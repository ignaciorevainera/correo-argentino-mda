import { chromium } from "playwright";
import assert from "node:assert/strict";

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("http://localhost:4321/directorio-oficinas");
  await page.waitForSelector("[data-master-detail-sort-item]");

  const initialRows = await page.locator("[data-master-detail-sort-item]").all();
  assert.ok(initialRows.length > 0);

  const regionSelect = page.locator("#regionFilter");
  const options = await regionSelect.locator("option").all();
  let selectedRegionValue = "";
  for (const option of options) {
    const val = await option.getAttribute("value");
    if (val && val !== "all") {
      selectedRegionValue = val;
      break;
    }
  }

  if (selectedRegionValue) {
    console.log(`Selecting region: ${selectedRegionValue}`);
    await Promise.all([
      page.waitForNavigation(),
      regionSelect.selectOption(selectedRegionValue)
    ]);
    
    const currentUrl = page.url();
    console.log(`Current URL after region selection: ${currentUrl}`);
    const urlObj = new URL(currentUrl);
    assert.equal(urlObj.searchParams.get("region"), selectedRegionValue);

    const selectedValue = await page.locator("#regionFilter").inputValue();
    assert.equal(selectedValue, selectedRegionValue);

    const filteredRows = await page.locator("[data-master-detail-sort-item]").all();
    console.log(`Filtered rows count: ${filteredRows.length}`);
  }

  const tabButton = page.locator('.filter-tabs-box button[data-tab-value]').nth(1);
  const hasTab = await tabButton.count();
  if (hasTab > 0) {
    const tabValue = await tabButton.getAttribute("data-tab-value");
    console.log(`Clicking tab: ${tabValue}`);
    await Promise.all([
      page.waitForNavigation(),
      tabButton.click()
    ]);

    const currentUrl = page.url();
    console.log(`Current URL after tab click: ${currentUrl}`);
    const urlObj = new URL(currentUrl);
    assert.equal(urlObj.searchParams.get("type"), tabValue);

    const activeTab = page.locator('.filter-tabs-box button[aria-selected="true"]');
    const activeTabValue = await activeTab.getAttribute("data-tab-value");
    assert.equal(activeTabValue, tabValue);

    const tabRows = await page.locator("[data-master-detail-sort-item]").all();
    console.log(`Tab filtered rows count: ${tabRows.length}`);
  }

  const searchInput = page.locator("#office-search");
  await searchInput.fill("xyz-non-existent-office-name-123");
  await page.waitForTimeout(1000);
  
  const noResultsState = page.locator("#no-results-state");
  const isVisible = await noResultsState.isVisible();
  assert.ok(isVisible);
  console.log("Empty state is visible on no results");

  await browser.close();
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
