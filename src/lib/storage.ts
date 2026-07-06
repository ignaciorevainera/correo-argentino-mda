import path from "node:path";
import fs from "node:fs";

const SUBDIR_APPS = "apps";
const SUBDIR_ICONS = "icons";
const SUBDIR_PDFS = "pdfs";

function getStorageRoot(): string {
  const envDir = import.meta.env?.EXTERNAL_STORAGE_DIR || process.env.EXTERNAL_STORAGE_DIR;
  return path.resolve(envDir || "./data/storage");
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
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error: any) {
    if (error.code === "EACCES" || error.code === "EPERM") {
      console.error(
        `[storage] No se pudo crear el directorio "${dir}": ${error.message}`,
      );
      return;
    }
    throw error;
  }
}
