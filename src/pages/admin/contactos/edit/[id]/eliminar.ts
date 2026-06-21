import type { APIRoute } from "astro";
import { db } from "@db/index";
import { providerContacts } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const contactId = Number(params.id);
  if (!contactId) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent("ID de contacto no proporcionado")}&toast_type=error`);
  }

  try {
    const [deleted] = await db
      .delete(providerContacts)
      .where(eq(providerContacts.id, contactId))
      .returning({
        provider: providerContacts.provider,
        service: providerContacts.service,
      });

    if (deleted) {
      const successMsg = `Contacto "${deleted.provider} - ${deleted.service}" eliminado con éxito.`;
      await logAdminAction((locals as any).user?.username || 'Sistema', `Eliminó el contacto "${deleted.provider} - ${deleted.service}"`);

      const base = import.meta.env.BASE_URL || "/";
      const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
      return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent(successMsg)}&toast_type=success`);
    } else {
      const base = import.meta.env.BASE_URL || "/";
      const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
      return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent("El contacto indicado no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error al eliminar contacto:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/admin/contactos?toast_msg=${encodeURIComponent("Error al eliminar el contacto.")}&toast_type=error`);
  }
};
