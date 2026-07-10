import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { getAppsDir } from "@lib/storage";


export const GET: APIRoute = ({ params }) => {
  const { filename } = params;
  const appsDir = getAppsDir();


  if (!filename) {
    return new Response("Nombre de archivo no especificado.", { status: 400 });
  }

  const sanitized = path.basename(filename);

  if (sanitized !== filename || sanitized.includes("..")) {
    return new Response("Nombre de archivo inválido.", { status: 400 });
  }

  const filePath = path.join(appsDir, sanitized);

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
