import type { APIRoute } from "astro";
import { db } from "@db/index";
import { applications } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { getAppsDir } from "@lib/storage";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const appId = params.id;
  if (!appId || isNaN(Number(appId))) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/aplicativos?toast_msg=${encodeURIComponent("ID de aplicativo no proporcionado")}&toast_type=error`);
  }

  try {
    const [existing] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, Number(appId)));

    if (existing?.filePath && !existing.filePath.startsWith("http")) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const appsDir = getAppsDir();
        const base = import.meta.env.BASE_URL || "/";
        const cleanBaseUrl = base.endsWith("/") ? base : base + "/";
        const downloadPrefix = `${cleanBaseUrl}api/download/`;
        const fileName = existing.filePath.startsWith(downloadPrefix)
          ? existing.filePath.slice(downloadPrefix.length)
          : path.basename(existing.filePath);

        const absPath = path.join(appsDir, fileName);
        if (fs.existsSync(absPath)) {
          fs.unlinkSync(absPath);
        }
      } catch (fsError: any) {
        console.error(
          `[aplicativos] No se pudo eliminar el archivo físico: ${fsError.message}`,
        );
      }
    }

    await db.delete(applications).where(eq(applications.id, Number(appId)));
    await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó el aplicativo "${existing?.title || appId}"`);

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/aplicativos?toast_msg=${encodeURIComponent("Aplicativo eliminado con éxito.")}&toast_type=success`);
  } catch (error) {
    console.error("Error al eliminar aplicativo:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/aplicativos?toast_msg=${encodeURIComponent("Error al eliminar el aplicativo.")}&toast_type=error`);
  }
};
