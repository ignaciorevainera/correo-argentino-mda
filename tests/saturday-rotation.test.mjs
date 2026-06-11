import assert from "node:assert/strict";
import { chromium } from "playwright";
import Database from "better-sqlite3";

// 1. Replicated Saturday Modulo Algorithm
function calculateActiveGroup(dateStr, startDateStr, startGroup, rotationOrderStr) {
  const dateObj = new Date(dateStr + "T12:00:00");
  const start = new Date(startDateStr + "T12:00:00");
  const diffDays = Math.round((dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const weeksDiff = Math.floor(diffDays / 7);
  const groups = rotationOrderStr.split(",").map((g) => g.trim());
  const N = groups.length;
  const startIndex = groups.indexOf(startGroup);
  const idx = startIndex >= 0 ? startIndex : 0;
  const activeIndex = ((idx + weeksDiff) % N + N) % N;
  return groups[activeIndex];
}

// 1.1 Verify Static Math Calculation Logic
console.log("--------------------------------------------------");
console.log("Step 1: Verifying Saturday Modulo Algorithm math...");
const testStartDate = "2026-06-06";
const testStartGroup = "A";
const testRotationOrder = "A,B,C,D";

const testCases = [
  { date: "2026-06-06", expected: "A" },
  { date: "2026-06-13", expected: "B" },
  { date: "2026-06-20", expected: "C" },
  { date: "2026-06-27", expected: "D" },
  { date: "2026-07-04", expected: "A" },
  { date: "2026-05-30", expected: "D" },
  { date: "2026-05-23", expected: "C" },
];

for (const { date, expected } of testCases) {
  const actual = calculateActiveGroup(date, testStartDate, testStartGroup, testRotationOrder);
  console.log(`Date: ${date} -> Expected: ${expected}, Actual: ${actual}`);
  assert.equal(actual, expected, `Date ${date} math calculation failed`);
}
console.log("✅ Saturday Modulo Algorithm math checks passed successfully.");
console.log("--------------------------------------------------");

async function runBrowserTest() {
  console.log("Step 2: Preparing session in database...");
  const db = new Database("./database/mda.db");
  const supervisorUser = db.prepare("SELECT * FROM users WHERE role = 'admin' OR role = 'supervisor' LIMIT 1").get();
  if (!supervisorUser) {
    throw new Error("No admin or supervisor user found in the database. Run migrations/seeding first.");
  }
  console.log(`Found user: ${supervisorUser.username} with role: ${supervisorUser.role}`);

  const mockSessionId = `test-session-${Date.now()}`;
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24; // 1 day
  
  db.prepare("INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)").run(mockSessionId, supervisorUser.id, expiresAt);
  console.log(`Created mock session ID: ${mockSessionId}`);

  console.log("Step 3: Launching Chromium using Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  // Inject the session cookie
  await context.addCookies([{
    name: "session_id",
    value: mockSessionId,
    domain: "localhost",
    path: "/",
  }]);
  
    const page = await context.newPage();

    // Listen for console logs and page errors
    page.on("console", (msg) => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error(`[Browser PageError] ${err.message}`);
    });

    try {
      const targetUrl = "http://localhost:4321/supervision/cronograma";
      console.log(`Navigating to ${targetUrl}...`);
      await page.goto(targetUrl);
      
      console.log("Waiting for network to become idle...");
      await page.waitForLoadState("networkidle");

      console.log("Current URL:", page.url());
      console.log("Page Title:", await page.title());

      console.log("Verifying #switch-to-groups-btn exists...");
      try {
        await page.waitForSelector("#switch-to-groups-btn", { state: "attached", timeout: 10000 });
      } catch (err) {
        console.log("Timeout waiting for #switch-to-groups-btn. HTML Body:");
        console.log(await page.content());
        throw err;
      }
      const switchToGroupsBtn = page.locator("#switch-to-groups-btn");
      const exists = await switchToGroupsBtn.count() > 0;
      assert.ok(exists, "#switch-to-groups-btn does not exist on the page");
    console.log("✅ #switch-to-groups-btn exists.");

    console.log("Clicking the 'Grupos' button...");
    await switchToGroupsBtn.click();

    console.log("Waiting for #groups-view to become visible...");
    await page.waitForSelector("#groups-view", { state: "visible", timeout: 5000 });
    const groupsViewVisible = await page.locator("#groups-view").isVisible();
    assert.ok(groupsViewVisible, "#groups-view is not visible");
    console.log("✅ #groups-view is visible.");

    console.log("Verifying #monthly-view is hidden...");
    const monthlyViewVisible = await page.locator("#monthly-view").isVisible();
    assert.ok(!monthlyViewVisible, "#monthly-view should be hidden");
    console.log("✅ #monthly-view is hidden.");

    console.log("Checking that the rotation config form inputs exist (date, group, order)...");
    const startDateInput = page.locator("#rotation-start-date");
    const startGroupSelect = page.locator("#rotation-start-group");
    const rotationOrderInput = page.locator("#rotation-order");

    assert.ok(await startDateInput.count() > 0, "Input #rotation-start-date does not exist");
    assert.ok(await startGroupSelect.count() > 0, "Select #rotation-start-group does not exist");
    assert.ok(await rotationOrderInput.count() > 0, "Input #rotation-order does not exist");
    console.log("✅ All rotation config form inputs exist.");

    console.log("Checking that the 4 group grid cards exist (#group-A-list, etc.)...");
    const groups = ["A", "B", "C", "D"];
    for (const group of groups) {
      const listSelector = `#group-${group}-list`;
      const listElement = page.locator(listSelector);
      assert.ok(await listElement.count() > 0, `${listSelector} does not exist`);
      console.log(`✅ ${listSelector} exists.`);
    }
    console.log("✅ All 4 group grid cards exist.");

    console.log("Checking that the Saturday Rotation Timeline elements exist...");
    const timelineDateInput = page.locator("#rotation-timeline-date");
    const activeGroupDisplay = page.locator("#rotation-active-group-display");
    const timelineTable = page.locator("#rotation-timeline-table");

    assert.ok(await timelineDateInput.count() > 0, "Input #rotation-timeline-date does not exist");
    assert.ok(await activeGroupDisplay.count() > 0, "Display #rotation-active-group-display does not exist");
    assert.ok(await timelineTable.count() > 0, "Table #rotation-timeline-table does not exist");
    console.log("✅ Saturday Rotation Timeline elements are rendered in the browser.");

    console.log("--------------------------------------------------");
    console.log("🎉 All browser-based verification tests passed successfully!");
  } finally {
    console.log("Closing the browser...");
    await browser.close();
    
    console.log("Cleaning up session from database...");
    db.prepare("DELETE FROM sessions WHERE id = ?").run(mockSessionId);
    console.log("Session cleaned up.");
  }
}

runBrowserTest().catch((error) => {
  console.log("❌ Test run failed:", error);
  process.exit(1);
});
