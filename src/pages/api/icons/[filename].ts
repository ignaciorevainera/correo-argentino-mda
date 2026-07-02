import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { getIconsDir } from "@lib/storage";

export const GET: APIRoute = ({ params }) => {
  const { filename } = params;

  if (!filename) {
    return new Response("Nombre de archivo no especificado.", { status: 400 });
  }

  const sanitized = path.basename(filename);

  if (sanitized !== filename || sanitized.includes("..")) {
    return new Response("Nombre de archivo inválido.", { status: 400 });
  }

  const filePath = path.join(getIconsDir(), sanitized);

  if (!fs.existsSync(filePath)) {
    return new Response("Ícono no disponible.", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(sanitized).toLowerCase();

  let contentType = "application/octet-stream";
  switch (ext) {
    case ".png":
      contentType = "image/png";
      break;
    case ".jpg":
    case ".jpeg":
      contentType = "image/jpeg";
      break;
    case ".svg":
      contentType = "image/svg+xml";
      break;
    case ".ico":
      contentType = "image/x-icon";
      break;
    case ".webp":
      contentType = "image/webp";
      break;
    case ".gif":
      contentType = "image/gif";
      break;
  }

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileBuffer.byteLength.toString(),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
    },
  });
};
