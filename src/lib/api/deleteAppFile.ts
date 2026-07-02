import { getCleanBase } from "@lib/baseUrl";
import { getAppsDir } from "@lib/storage";

export async function deleteAppPhysicalFile(filePath: string): Promise<void> {
  if (!filePath || filePath.startsWith("http")) return;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const cleanBase = getCleanBase();
  const downloadPrefix = `${cleanBase}api/download/`;
  const fileName = filePath.startsWith(downloadPrefix)
    ? filePath.slice(downloadPrefix.length)
    : path.basename(filePath);
  const absPath = path.join(getAppsDir(), fileName);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
}
