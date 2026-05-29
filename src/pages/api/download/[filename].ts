import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

const STORAGE_DIR = path.resolve(
  process.env.EXTERNAL_STORAGE_DIR || "C:/Projects/correo-argentino-mda-programs",
);

export const GET: APIRoute = ({ params }) => {
  const { filename } = params;

  if (!filename) {
    return new Response("Nombre de archivo no especificado.", { status: 400 });
  }

  const sanitized = path.basename(filename);

  if (sanitized !== filename || sanitized.includes("..")) {
    return new Response("Nombre de archivo inválido.", { status: 400 });
  }

  const filePath = path.join(STORAGE_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    return new Response("Archivo no disponible.", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${sanitized}"`,
      "Content-Length": fileBuffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
};
