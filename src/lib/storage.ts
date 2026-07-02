import path from "node:path";
import fs from "node:fs";

const SUBDIR_APPS = "apps";
const SUBDIR_ICONS = "icons";
const SUBDIR_PDFS = "pdfs";

function getStorageRoot(): string {
  return path.resolve(
    process.env.EXTERNAL_STORAGE_DIR || "./data/storage",
  );
}

export function getAppsDir(): string {
  return path.join(getStorageRoot(), SUBDIR_APPS);
}

export function getIconsDir(): string {
  return path.join(getStorageRoot(), SUBDIR_ICONS);
}

export function getPdfsDir(): string {
  return path.join(getStorageRoot(), SUBDIR_PDFS);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
