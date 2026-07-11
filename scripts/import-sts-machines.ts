import "dotenv/config";
import { writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { readCsvFile, previewImport, applyImport, createCsvOnlyOffices } from "./lib/stsImport";
import type { ImportDiff } from "./lib/stsImport";

const DEFAULT_FILE = "public/data/maquinas_STS 4.csv";
const BACKUP_DIR = resolve("scripts/backups");
const REPORT_DIR = resolve("scripts/reports");

function parseArgs() {
  const args = process.argv.slice(2);
  let file = DEFAULT_FILE;
  let apply = false;
  let user = "mda-import-cli";
  let createOffices = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && i + 1 < args.length) {
      file = args[++i];
    } else if (args[i] === "--apply") {
      apply = true;
    } else if (args[i] === "--create-offices") {
      createOffices = true;
    } else if (args[i] === "--user" && i + 1 < args.length) {
      user = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Usage: npx tsx scripts/import-sts-machines.ts [options]

Options:
  --file <path>         CSV file path (default: ${DEFAULT_FILE})
  --apply               Apply changes to DB (default: dry-run only)
  --user <name>         Username for audit log (default: mda-import-cli)
  --create-offices      Create missing TELEGRAFIA offices from CSV (requires --apply)
  --help, -h            Show this help
`);
      process.exit(0);
    }
  }

  return { file, apply, user, createOffices };
}

function backupDatabase(): string {
  const src = resolve("database/mda.db");
  if (!existsSync(src)) {
    console.error(`ERROR: Database not found at ${src}`);
    process.exit(1);
  }

  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const dest = resolve(BACKUP_DIR, `mda-${ts}.db`);

  copyFileSync(src, dest);
  console.log(`Backup: ${dest}`);
  return dest;
}

function writeReport(diff: ImportDiff, filePath: string): void {
  const report = {
    timestamp: new Date().toISOString(),
    matched: diff.matched,
    csvOnlyOffices: diff.csvOnlyOffices,
    dbOnlyOffices: diff.dbOnlyOffices,
    assetMutations: {
      inserts: diff.totalInserts,
      updates: diff.totalUpdates,
      noops: diff.totalNoops,
      skippedNoHostname: diff.totalSkippedNoHostname,
      details: diff.mutations,
    },
  };

  if (!existsSync(dirname(filePath))) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`Report: ${filePath}`);
}

async function main() {
  const { file, apply, user, createOffices } = parseArgs();

  console.log("=== STS Machines Import ===");
  console.log(`  File:           ${resolve(file)}`);
  console.log(`  Mode:           ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`  Create offices: ${createOffices ? "YES" : "no"}`);
  console.log(`  User:           ${user}`);
  console.log();

  if (!existsSync(file)) {
    console.error(`ERROR: File not found: ${file}`);
    process.exit(1);
  }

  const csvOffices = readCsvFile(file);
  console.log(`CSV: ${csvOffices.length} unique offices (${csvOffices.reduce((s, o) => s + o.machines.length, 0)} machine rows)`);
  console.log();

  // Phase 0: initial preview
  const beforeDiff = await previewImport(csvOffices);
  const csvOnlyCount = beforeDiff.csvOnlyOffices.length;

  console.log("=== Phase 1: Office Creation ===");
  console.log(`  Offices to create: ${csvOnlyCount}`);

  if (createOffices) {
    if (!apply) {
      console.log("  Dry-run: offices would be created:");
      for (const o of beforeDiff.csvOnlyOffices) {
        console.log(`    ${o.codigoSts}  ${o.name}  (${o.province})`);
      }
      if (csvOnlyCount === 0) {
        console.log("  No pending offices to create.");
      }
      console.log("  Run with --apply to execute.");
    } else {
      console.log("  Creating offices + backfilling searchableText...");
      const created = await createCsvOnlyOffices(csvOffices, user);
      if (created.length > 0) {
        console.log(`  Created ${created.length} offices:`);
        for (const o of created) {
          console.log(`    ${o.codigoSts}  ${o.name}  (${o.provinceCode})`);
        }
      }
    }
  } else if (csvOnlyCount > 0) {
    for (const o of beforeDiff.csvOnlyOffices) {
      console.log(`    ${o.codigoSts}  ${o.name}  (${o.province})`);
    }
    console.log("  Use --create-offices --apply to create them.");
  }

  console.log();

  // Phase 2: asset import (re-preview if offices were just created)
  const diff = createOffices && apply ? await previewImport(csvOffices) : beforeDiff;

  console.log("=== Phase 2: Asset Import ===");
  console.log(`  Matched by Codigo STS:  ${diff.matched}`);
  console.log(`  CSV-only (pending):     ${diff.csvOnlyOffices.length}`);
  console.log(`  DB-only (not in CSV):   ${diff.dbOnlyOffices.length}`);
  console.log();
  console.log("  Asset Mutations:");
  console.log(`    Insert: ${diff.totalInserts}`);
  console.log(`    Update: ${diff.totalUpdates}`);
  console.log(`    No-op:  ${diff.totalNoops}`);
  console.log(`    Skip:   ${diff.totalSkippedNoHostname}`);
  console.log();

  if (diff.dbOnlyOffices.length > 0) {
    console.log("--- DB-only: oficinas TELEGRAFIA sin máquina en CSV ---");
    for (const o of diff.dbOnlyOffices) {
      console.log(`  ${o.code}  ${o.name}  (${o.provinceCode})`);
    }
    console.log();
  }

  if (diff.totalUpdates > 0 || diff.totalInserts > 0) {
    console.log("--- Detail ---");
    for (const m of diff.mutations) {
      if (m.action === "update") {
        console.log(`  UPDATE ${m.officeCode}/${m.type} id=${m.existingAssetId}: ${m.changedFields?.join(", ")}`);
      } else if (m.action === "insert") {
        console.log(`  INSERT ${m.officeCode}/${m.type}: hostname=${m.hostname || "-"} ip=${m.ip || "-"}`);
      }
    }
    console.log();
  }

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const reportPath = resolve(REPORT_DIR, `import-sts-${ts}.json`);
  writeReport(diff, reportPath);

  if (!apply) {
    console.log("DRY-RUN complete. Run with --apply to execute.");
    process.exit(0);
  }

  console.log("WARNING: This will modify the database.");
  if (!process.env.CI) {
    console.log("Press Ctrl+C within 5 seconds to abort...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  backupDatabase();

  try {
    await applyImport(diff, user);
    console.log("SUCCESS: All changes applied.");
  } catch (err) {
    console.error("ERROR during apply:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
