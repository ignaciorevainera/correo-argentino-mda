import fs from "node:fs";
import path from "node:path";
import { getAppsDir, ensureDir } from "@lib/storage";

const MAX_SIZE_BYTES = 100 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set<string>([
  ".zip",
  ".exe",
  ".msi",
  ".rar",
]);

const ALLOWED_MIME_TYPES = new Set<string>([
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-msdownload",
  "application/vnd.microsoft.portable-executable",
  "application/x-msi",
  "application/octet-stream",
]);

export async function processAppFileUpload(
  appFile: File | null,
  currentFilePath: string | null,
): Promise<string | null> {
  if (!appFile || appFile.size === 0 || !appFile.name) {
    return null;
  }

  if (appFile.size > MAX_SIZE_BYTES) {
    const mb = (appFile.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `El archivo excede el tamaño máximo de 100 MB. El archivo pesa ${mb} MB.`,
    );
  }

  const ext = path.extname(appFile.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `La extensión "${ext}" no está permitida. Usá .zip, .exe, .msi o .rar.`,
    );
  }

  if (!ALLOWED_MIME_TYPES.has(appFile.type)) {
    throw new Error(
      `El tipo de archivo "${appFile.type || "desconocido"}" no está permitido.`,
    );
  }

  const baseName = path
    .basename(appFile.name, ext)
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/_+/g, "_");
  const safeFileName = `${Date.now()}_${baseName}${ext}`;

  const appsDir = getAppsDir();
  ensureDir(appsDir);

  try {
    const buffer = Buffer.from(await appFile.arrayBuffer());
    fs.writeFileSync(path.join(appsDir, safeFileName), buffer);
  } catch (writeError: any) {
    console.error(
      `[appFileUpload] Error al escribir "${safeFileName}": ${writeError.message}`,
    );
    throw new Error(
      "No se pudo guardar el archivo en el servidor. Verificá los permisos de la carpeta de almacenamiento.",
    );
  }

  if (currentFilePath && !currentFilePath.startsWith("http")) {
    try {
      const oldFileName = path.basename(currentFilePath);
      const oldAbsPath = path.join(appsDir, oldFileName);
      if (fs.existsSync(oldAbsPath)) {
        fs.unlinkSync(oldAbsPath);
      }
    } catch {
      // Non-critical
    }
  }

  return safeFileName;
}
