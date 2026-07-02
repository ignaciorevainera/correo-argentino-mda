import fs from "node:fs";
import path from "node:path";

const STORAGE_DIR = path.resolve(
  process.env.EXTERNAL_STORAGE_DIR || "./data/storage",
);
const PRIVATE_DIR = process.env.EXTERNAL_PRIVATE_DIR
  ? path.resolve(process.env.EXTERNAL_PRIVATE_DIR)
  : null;

const APPS_DIR = path.join(STORAGE_DIR, "apps");
const PDFS_DIR = path.join(STORAGE_DIR, "pdfs");

function moveFiles(src: string, dest: string, description: string): void {
  if (!fs.existsSync(src)) {
    console.log(`[skip] Source does not exist: ${src}`);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  let moved = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (fs.existsSync(destPath)) {
      console.log(`[skip] Already exists: ${destPath}`);
      continue;
    }

    fs.renameSync(srcPath, destPath);
    moved++;
  }

  console.log(`[done] Moved ${moved} ${description} from ${src} to ${dest}`);
}

console.log("=== Storage Migration Script ===");
console.log(`STORAGE_DIR: ${STORAGE_DIR}`);
if (PRIVATE_DIR) console.log(`PRIVATE_DIR: ${PRIVATE_DIR}`);
console.log("");

moveFiles(STORAGE_DIR, APPS_DIR, "app binaries");

if (PRIVATE_DIR) {
  moveFiles(PRIVATE_DIR, PDFS_DIR, "instruction PDFs");
} else {
  console.log("[skip] EXTERNAL_PRIVATE_DIR not set — skipping PDF migration");
}

console.log("");
console.log("Migration complete. Verify and then remove EXTERNAL_PRIVATE_DIR from .env if desired.");
