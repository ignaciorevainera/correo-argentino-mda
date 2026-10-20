import { and, eq, or } from "drizzle-orm";
import { db } from "@db/index";
import { mesas } from "@db/schema";
import { MDA_TI_HELPDESK } from "@lib/helpdeskAccess";

export interface MesaAsignable {
  id: number;
  name: string;
}

/**
 * Mesas que el portal ofrece en sus selectores (#246): activas y asignables.
 * La mesa MDA TI se incluye aunque no sea asignable porque es la mesa de
 * trabajo del propio equipo. Única fuente de verdad: la consumen la API de
 * estadísticas y la vista de estadísticas; si cambia el criterio, cambia acá.
 */
export async function listMesasAsignables(): Promise<MesaAsignable[]> {
  return db
    .select({ id: mesas.invgateId, name: mesas.name })
    .from(mesas)
    .where(
      and(
        eq(mesas.active, true),
        or(eq(mesas.assignable, true), eq(mesas.name, MDA_TI_HELPDESK)),
      ),
    )
    .orderBy(mesas.name);
}
