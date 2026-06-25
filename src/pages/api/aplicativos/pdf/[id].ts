import type { APIRoute } from "astro";
import { db } from "@db/index";
import { applications } from "@db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

export const GET: APIRoute = async ({ params, locals }) => {
  // Verificar que el usuario esté autenticado
  if (!locals.user || locals.user.id === 0) {
    return new Response("No autorizado. Inicie sesión para descargar este recurso.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response("ID del aplicativo requerido.", { status: 400 });
  }

  try {
    const appId = parseInt(id, 10);
    if (isNaN(appId)) {
      return new Response("ID del aplicativo inválido.", { status: 400 });
    }

    // Buscar el aplicativo en la base de datos
    const [app] = await db
      .select({
        instructionPdfPath: applications.instructionPdfPath,
        title: applications.title,
      })
      .from(applications)
      .where(eq(applications.id, appId))
      .limit(1);

    if (!app || !app.instructionPdfPath) {
      return new Response("El instructivo PDF no existe para este aplicativo.", {
        status: 444, // Custom status or 404
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const privateDir = path.resolve(
      process.env.EXTERNAL_PRIVATE_DIR || "C:/Projects/correo-argentino-mda-private-pdfs"
    );

    const filePath = path.join(privateDir, app.instructionPdfPath);

    // Verificar si el archivo físico existe
    if (!fs.existsSync(filePath)) {
      console.error(`[PDF Endpoint] Archivo no encontrado en el servidor: ${filePath}`);
      return new Response("El archivo físico del instructivo no se encuentra en el servidor.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Leer el archivo y transmitirlo
    const fileBuffer = fs.readFileSync(filePath);
    
    // Generar un nombre de archivo seguro para la descarga
    const safeTitle = app.title.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const downloadName = `${safeTitle}_instructivo.pdf`;

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error(`[PDF Endpoint] Error al servir PDF: ${error.message}`);
    return new Response("Error interno del servidor al procesar el PDF.", { status: 500 });
  }
};
