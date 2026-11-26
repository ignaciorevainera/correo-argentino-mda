import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getAppsDir } from "@lib/storage";
import { requireSession } from "@lib/rbac-middleware";

export const GET: APIRoute = async ({ params, locals }) => {
  const denied = await requireSession(locals);
  if (denied) return denied;
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

  const stat = fs.statSync(filePath);
  const webStream = Readable.toWeb(fs.createReadStream(filePath));

  return new Response(webStream as any, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${sanitized}"`,
      "Content-Length": stat.size.toString(),
      "Cache-Control": "no-store",
    },
  });
};
