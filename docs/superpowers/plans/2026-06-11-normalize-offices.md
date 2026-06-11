# Normalize Offices Encoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a one-off executable TypeScript script `scripts/normalize-offices.ts` to identify and repair encoding artifacts (Mojibake) in the `offices` table.

**Architecture:** Load all offices from the SQLite database using Drizzle ORM, check if their names contain Mojibake sequence matches, normalize the names in-memory, log the before-and-after mapping, and conditionally update the database (only if not running in dry-run mode).

**Tech Stack:** TypeScript, Drizzle ORM, `better-sqlite3`, `tsx`.

---

### Task 1: Create the Normalization Script

**Files:**
- Create: `scripts/normalize-offices.ts`

- [ ] **Step 1: Write normalization logic and basic setup**

Create the file `scripts/normalize-offices.ts` with the following content:
```typescript
import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { offices } from "../src/db/schema";

const MOJIBAKE_MAP: Record<string, string> = {
  "\u00C3\u00A1": "á",
  "\u00C3\u00A9": "é",
  "\u00C3\u00AD": "í",
  "\u00C3\u00B3": "ó",
  "\u00C3\u00BA": "ú",
  "\u00C3\u00B1": "ñ",
  "\u00C3\u0081": "Á",
  "\u00C3\u0089": "É",
  "\u00C3\u008D": "Í",
  "\u00C3\u0093": "Ó",
  "\u00C3\u009A": "Ú",
  "\u00C3\u0091": "Ñ",
};

export function normalizeName(name: string): string {
  let normalized = name;
  for (const [mojibake, correct] of Object.entries(MOJIBAKE_MAP)) {
    normalized = normalized.replaceAll(mojibake, correct);
  }
  return normalized;
}

// Simple internal assertions to verify correctness
function selfTest() {
  const testCases = [
    { input: "San Mart\u00C3\u00ADn", expected: "San Martín" },
    { input: "Constituci\u00C3\u00B3n", expected: "Constitución" },
    { input: "Neuqu\u00C3\u00A9n", expected: "Neuquén" },
    { input: "Espa\u00C3\u00B1a", expected: "España" }
  ];

  for (const { input, expected } of testCases) {
    const output = normalizeName(input);
    if (output !== expected) {
      throw new Error(`Self-test failed for: ${input}. Expected "${expected}", got "${output}"`);
    }
  }
  console.log("[\u2713] Self-test validation passed successfully.");
}

async function run() {
  selfTest();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`[Script] Starting normalization. Mode: ${dryRun ? "DRY-RUN (no database writes)" : "WRITE (updates DB)"}`);

  const allOffices = await db.select({
    id: offices.id,
    name: offices.name
  }).from(offices);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const office of allOffices) {
    const originalName = office.name;
    const normalizedName = normalizeName(originalName);

    if (originalName !== normalizedName) {
      updatedCount++;
      console.log(`[ID: ${office.id}] "${originalName}" -> "${normalizedName}"`);

      if (!dryRun) {
        await db.update(offices)
          .set({ name: normalizedName })
          .where(eq(offices.id, office.id));
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`[Script] Finished. Total processed: ${allOffices.length}. Updated/To Update: ${updatedCount}. Skipped: ${skippedCount}.`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("normalize-offices.ts")) {
  run().catch((err) => {
    console.error("Critical error in normalization script:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run dry-run of the script to verify Mojibake detection**

Run:
```powershell
npx tsx scripts/normalize-offices.ts --dry-run
```
Expected output:
- `[✓] Self-test validation passed successfully.`
- List of changed offices with before -> after names.
- Database is NOT written.

- [ ] **Step 3: Run write mode of the script**

Run:
```powershell
npx tsx scripts/normalize-offices.ts
```
Expected output:
- `[✓] Self-test validation passed successfully.`
- Normalization logs.
- Database changes written.

- [ ] **Step 4: Run dry-run again to verify idempotency**

Run:
```powershell
npx tsx scripts/normalize-offices.ts --dry-run
```
Expected output:
- `[✓] Self-test validation passed successfully.`
- `Updated/To Update: 0` (no more items require modification).

- [ ] **Step 5: Commit changes**

Run:
```powershell
git add scripts/normalize-offices.ts
git commit -m "feat: add database normalization script for office names Mojibake"
```
