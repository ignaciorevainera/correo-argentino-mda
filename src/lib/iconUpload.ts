import fs from "node:fs";
import path from "node:path";
import { getIconsDir, ensureDir } from "@lib/storage";

const MAX_ICON_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/x-icon",
]);

const ALLOWED_EXTENSIONS = new Set<string>([
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".ico",
]);

interface ProcessIconUploadParams {
  /** The File object from FormData (can be null if no file was uploaded). */
  iconFile: File | null;
  /** The current iconPath stored in DB (used to delete the old file). */
  currentIconPath: string | null;
}

/**
 * Validates, sanitizes, and persists an icon file to EXTERNAL_STORAGE_DIR/icons.
 *
 * @returns The new icon filename (for DB storage), or `null` if no file was provided.
 * @throws {Error} With a descriptive message if validation or I/O fails.
 */
export async function processIconUpload({
  iconFile,
  currentIconPath,
}: ProcessIconUploadParams): Promise<string | null> {
  if (!iconFile || iconFile.size === 0 || !iconFile.name) {
    return null;
  }

  // 1. Size validation (413 — Payload Too Large)
  if (iconFile.size > MAX_ICON_SIZE_BYTES) {
    throw new Error(
      `El ícono excede el tamaño máximo permitido de 2 MB. El archivo pesa ${(iconFile.size / (1024 * 1024)).toFixed(2)} MB.`,
    );
  }

  // 2. MIME type validation (415 — Unsupported Media Type)
  if (!ALLOWED_MIME_TYPES.has(iconFile.type)) {
    throw new Error(
      `El tipo de archivo "${iconFile.type || "desconocido"}" no está permitido. Usá imágenes PNG, JPG, SVG o ICO.`,
    );
  }

  // 3. Extension validation (defense in depth)
  const ext = path.extname(iconFile.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `La extensión "${ext}" no está permitida. Usá archivos .png, .jpg, .jpeg, .svg o .ico.`,
    );
  }

  // 4. Filename sanitization (Path Traversal mitigation)
  const baseName = path
    .basename(iconFile.name, ext)
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/_+/g, "_");
  const safeFileName = `${Date.now()}_icon_${baseName}${ext}`;

  // Resolve storage directory
  const iconsDir = getIconsDir();

  // Ensure directory exists
  try {
    ensureDir(iconsDir);
  } catch (dirError: any) {
    if (dirError.code !== "EACCES" && dirError.code !== "EPERM") {
      throw dirError;
    }
    console.error(
      `[iconUpload] No se pudo crear el directorio "${iconsDir}": ${dirError.message}`,
    );
  }

  // 5. Write file with I/O error handling (500 — Internal Server Error)
  try {
    const buffer = Buffer.from(await iconFile.arrayBuffer());
    fs.writeFileSync(path.join(iconsDir, safeFileName), buffer);
  } catch (writeError: any) {
    console.error(
      `[iconUpload] Error al escribir "${safeFileName}": ${writeError.message}`,
    );
    throw new Error(
      "No se pudo guardar el ícono en el servidor. Verificá los permisos de la carpeta de almacenamiento.",
    );
  }

  // 6. Cleanup old icon file
  if (currentIconPath) {
    try {
      const oldAbsPath = path.join(iconsDir, path.basename(currentIconPath));
      if (fs.existsSync(oldAbsPath)) {
        fs.unlinkSync(oldAbsPath);
      }
    } catch {
      // Non-critical: old file cleanup is best-effort
    }
  }

  return safeFileName;
}
