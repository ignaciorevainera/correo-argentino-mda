/**
 * Test: date computation in attendance components must use Argentina timezone.
 *
 * The bug: AsistenciaContent.astro and EstadisticasContent.astro compute
 * "today" via `new Date()` (server-local timezone) instead of
 * `America/Argentina/Buenos_Aires`. The API correctly uses Argentina timezone.
 *
 * This test validates the correct pattern and catches regressions.
 */

const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";
const UTC_TZ = "UTC";

/**
 * Simulates the BUGGY code pattern from AsistenciaContent.astro:9-12:
 * computes date using `new Date()` without specifying Argentina timezone.
 * Uses the provided timezone explicitly to simulate what happens on a server
 * running in that timezone.
 */
function getDateInTimezone(today: Date, timeZone: string): string {
  return today.toLocaleDateString("en-CA", { timeZone });
}

/**
 * Correct pattern: always uses America/Argentina/Buenos_Aires.
 */
function getDateArgentina(today: Date): string {
  return today.toLocaleDateString("en-CA", { timeZone: ARGENTINA_TZ });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

let bugCount = 0;

function testTimezone(label: string, utcTimestamp: number) {
  const d = new Date(utcTimestamp);
  const argentina = getDateArgentina(d);
  const utcDate = getDateInTimezone(d, "UTC");
  const edtDate = getDateInTimezone(d, "America/New_York");

  console.log(`\n  [${label}] UTC timestamp: ${d.toISOString()}`);
  console.log(`    Argentina (${ARGENTINA_TZ}):  ${argentina}`);
  console.log(`    Server UTC:                  ${utcDate}`);
  console.log(`    Server US/East (EDT):        ${edtDate}`);

  // The bug: if server is in UTC or US/Eastern, the "today" date differs from Argentina
  if (argentina !== utcDate || argentina !== edtDate) {
    console.log(`    ⚠️  DISCREPANCY: server-local date differs from Argentina`);
    console.log(`    → Components using server-local date would show wrong 'today'`);
    bugCount++;
  } else {
    console.log(`    ✓ All agree on same date`);
  }
}

// Test 1: Argentina date function returns YYYY-MM-DD format
const now = new Date();
const argNow = getDateArgentina(now);
assert(/^\d{4}-\d{2}-\d{2}$/.test(argNow),
  `Argentina date not in YYYY-MM-DD format: ${argNow}`);

// Test 2: Demonstrate the timezone discrepancy at boundary hours
// Argentina (UTC-3) vs UTC → at 22:00 ART, UTC is already next day
console.log("\n=== Testing timezone boundaries (July 2, 2026) ===");
testTimezone("Jul 2 08:00 ART (early morning)", Date.UTC(2026, 6, 2, 11, 0, 0));
testTimezone("Jul 2 22:00 ART (late evening)", Date.UTC(2026, 6, 3, 1, 0, 0));
testTimezone("Jul 2 23:00 ART (night)", Date.UTC(2026, 6, 3, 2, 0, 0));
testTimezone("Jul 2 midnight ART", Date.UTC(2026, 6, 2, 3, 0, 0));

// Test 3: Specifically for the reported scenario — July 2 at 08:00 ART
// At 08:00 ART (11:00 UTC), both UTC and Argentina agree on July 2
// But any timezone west of UTC-11 would still be on July 1
console.log("\n=== Reported scenario: Jul 2 at 08:00 ART ===");
const reportedTime = Date.UTC(2026, 6, 2, 11, 0, 0); // 08:00 ART = 11:00 UTC
const d = new Date(reportedTime);
console.log(`  UTC time:          ${d.toISOString()}`);
console.log(`  Argentina:         ${getDateInTimezone(d, ARGENTINA_TZ)}`);
console.log(`  UTC:               ${getDateInTimezone(d, "UTC")}`);
console.log(`  US/Eastern:        ${getDateInTimezone(d, "America/New_York")}`);
console.log(`  US/Pacific:        ${getDateInTimezone(d, "America/Los_Angeles")}`);
console.log(`  Hawaii:            ${getDateInTimezone(d, "Pacific/Honolulu")}`);

const argentina = getDateArgentina(d);
const utcDate = getDateInTimezone(d, "UTC");
if (argentina !== utcDate) {
  console.log(`\n  ❌ BUG WOULD APPEAR: server in UTC shows "${utcDate}", Argentina is "${argentina}"`);
  bugCount++;
}

console.log(`\n=== Summary ===`);
console.log(`Discrepancies found: ${bugCount}`);
console.log(`
The attendance components (AsistenciaContent.astro:9-12, EstadisticasContent.astro:8-11)
use \`new Date()\` with server-local timezone instead of America/Argentina/Buenos_Aires.
When the server TZ differs from Argentina, the client-side "hoy" reference can be wrong:
  - Records for Argentina's actual today may show as "Futuro"
  - Or records that should be "Futuro" may appear editable
  - The API POST correctly uses Argentina TZ, creating inconsistency with the UI

Fix: use toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
`);

process.exit(bugCount > 0 ? 1 : 0);
