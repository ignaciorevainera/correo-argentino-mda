import assert from "node:assert/strict";
import { chromium } from "playwright";
import Database from "better-sqlite3";

async function runBrowserTest() {
  console.log("--------------------------------------------------");
  console.log("Starting Weekend Overtime E2E Verification Test...");
  
  console.log("Step 1: Preparing database and session...");
  const db = new Database("./database/mda.db");
  const supervisorUser = db.prepare("SELECT * FROM users WHERE role = 'admin' OR role = 'supervisor' LIMIT 1").get();
  if (!supervisorUser) {
    throw new Error("No admin or supervisor user found in the database. Run migrations/seeding first.");
  }
  
  const testAgent = db.prepare("SELECT * FROM agents LIMIT 1").get();
  if (!testAgent) {
    throw new Error("No agents found in database");
  }
  console.log(`Found user: ${supervisorUser.username} and test agent: ${testAgent.name}`);

  const mockSessionId = `test-session-ot-${Date.now()}`;
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24; // 1 day
  
  db.prepare("INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)").run(mockSessionId, supervisorUser.id, expiresAt);
  console.log(`Created mock session ID: ${mockSessionId}`);

  console.log("Step 2: Launching Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  // Inject session cookie
  await context.addCookies([{
    name: "session_id",
    value: mockSessionId,
    domain: "localhost",
    path: "/",
  }]);
  
  const page = await context.newPage();

  // Listen for console messages
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Console ERROR] ${msg.text()}`);
    }
  });

  try {
    const targetUrl = "http://localhost:4321/supervision/cronograma";
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl);
    await page.waitForLoadState("networkidle");

    console.log("Step 3: Switching to Overtime view...");
    const switchToOtBtn = page.locator("#switch-to-overtime-btn");
    assert.ok(await switchToOtBtn.count() > 0, "#switch-to-overtime-btn does not exist");
    await switchToOtBtn.click();
    await page.waitForSelector("#overtime-view", { state: "visible", timeout: 5000 });
    console.log("✅ Overtime view is visible.");

    console.log("Step 4: Selecting Saturday date 2026-06-06...");
    const shiftsResponsePromise = page.waitForResponse(response => 
      response.url().includes('/api/cronograma/overtime/shifts') && response.status() === 200
    );
    await page.fill("#overtime-weekend-date", "2026-06-06");
    await page.dispatchEvent("#overtime-weekend-date", "change");
    await shiftsResponsePromise;
    console.log("✅ Selected weekend date and shifts loaded.");

    console.log("Step 5: Selecting referente...");
    await page.selectOption("#overtime-referente-select", testAgent.name);
    const configResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/cronograma/overtime/config') && response.status() === 200
    );
    await page.click("#save-overtime-referente-btn");
    await configResponsePromise;
    console.log("✅ Referente saved successfully.");

    console.log("Step 6: Creating a new overtime shift for the test agent...");
    await page.selectOption("#overtime-shift-agent", String(testAgent.id));
    await page.selectOption("#overtime-shift-day", "saturday");
    await page.fill("#overtime-shift-start", "13:00");
    await page.fill("#overtime-shift-end", "17:00");
    
    const addShiftResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/cronograma/overtime/shifts') && response.status() === 200
    );
    await page.click("#overtime-shift-submit-btn");
    await addShiftResponsePromise;
    console.log("✅ Overtime shift added successfully.");

    console.log("Step 7: Verifying shift card renders in the list...");
    const shiftCard = page.locator(".overtime-shift-card");
    const cardText = await shiftCard.innerText();
    assert.ok(cardText.includes(testAgent.name), `Expected shift card to contain agent name '${testAgent.name}', but got: '${cardText}'`);
    assert.ok(cardText.includes("13:00 – 17:00"), "Expected shift card to contain hours '13:00 – 17:00'");
    console.log("✅ Shift card verified.");

    console.log("Step 8: Switching to Monthly view and checking cell indicator...");
    await page.click("#switch-to-monthly-btn");
    await page.waitForSelector("#monthly-view", { state: "visible", timeout: 5000 });
    
    // Set monthly view date to June 2026 programmatically (since the element is opacity-0/hidden)
    await page.evaluate(() => {
      const input = document.getElementById('date-input');
      if (input) {
        input.value = "2026-06-01";
        input.dispatchEvent(new Event("change"));
      }
    });
    await page.waitForLoadState("networkidle");

    const cellSelector = `button[data-operator="${testAgent.name}"][data-date="2026-06-06"]`;
    await page.waitForSelector(cellSelector, { state: "visible", timeout: 5000 });
    const cellContent = await page.locator(cellSelector).innerText();
    assert.ok(cellContent.includes("HE: 13:00"), `Expected cell to display 'HE: 13:00', but got: '${cellContent}'`);
    console.log("✅ Monthly cell indicator verified.");

    console.log("Step 9: Clicking cell and verifying MonthlyDetailModal shows overtime info...");
    await page.click(cellSelector);
    await page.waitForSelector("#monthly-detail-overlay", { state: "visible", timeout: 5000 });
    
    const otModalText = await page.locator("#monthly-detail-overtime-text").innerText();
    assert.ok(otModalText.includes("13:00 - 17:00"), `Expected modal to show overtime '13:00 - 17:00', but got: '${otModalText}'`);
    console.log("✅ MonthlyDetailModal overtime details verified.");

    // Close modal
    await page.click("#monthly-detail-close");
    await page.waitForSelector("#monthly-detail-overlay", { state: "hidden", timeout: 5000 });

    console.log("Step 10: Switching to Daily view and verifying overtime indicator...");
    await page.click("#switch-to-daily-btn");
    await page.waitForSelector("#daily-view", { state: "visible", timeout: 5000 });
    
    // Set daily view date to 2026-06-06 programmatically
    await page.evaluate(() => {
      const input = document.getElementById('date-input');
      if (input) {
        input.value = "2026-06-06";
        input.dispatchEvent(new Event("change"));
      }
    });
    await page.waitForLoadState("networkidle");

    const opRow = page.locator(`tr:has(button[data-op-profile="${testAgent.name}"])`);
    const dailyModalCellText = await opRow.locator("td").nth(1).innerText();
    assert.ok(dailyModalCellText.includes("HE: 13:00 - 17:00"), `Expected daily cell to contain 'HE: 13:00 - 17:00', but got: '${dailyModalCellText}'`);
    console.log("✅ Daily view overtime indicator verified.");

    console.log("--------------------------------------------------");
    console.log("🎉 All E2E verification checks passed successfully!");
  } finally {
    console.log("Step 11: Cleaning up database and browser...");
    await browser.close();
    
    // Delete session
    db.prepare("DELETE FROM sessions WHERE id = ?").run(mockSessionId);
    
    // Clean up test data for 2026-06-06
    db.prepare("DELETE FROM weekend_overtime_config WHERE weekend_start_date = '2026-06-06'").run();
    db.prepare("DELETE FROM weekend_overtime_shifts WHERE weekend_start_date = '2026-06-06'").run();
    console.log("✅ Database and browser cleanup complete.");
  }
}

runBrowserTest().catch((error) => {
  console.error("❌ E2E test run failed:", error);
  process.exit(1);
});
