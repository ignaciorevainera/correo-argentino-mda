// src/lib/permissions/bootstrap.ts
import { db } from "../../db";
import { routes, modules } from "../../db/schema";
import { routePermissions } from "../rbac";
import { sql } from "drizzle-orm";
import { loadPermissionsCache } from "./cache";

const ROUTE_LABELS: Record<string, string> = {
  "/admin/usuarios-sin-ubicacion": "Usuarios sin ubicación",
  "/admin/usuarios": "Usuarios",
  "/admin/auditoria": "Auditoría",
  "/admin/invgate/ubicaciones": "Ubicaciones InvGate",
  "/admin": "Panel de Administración",
  "/supervision/asistencia": "Control de asistencia",
  "/supervision/cronograma": "Cronograma",
  "/supervision/calidad-operadores": "Calidad de operadores",
  "/supervision/asignacion-autogestiones": "Asignación de autogestiones",
  "/supervision": "Supervisión",
  "/mesas-de-ayuda/create": "Mesas de ayuda - Crear",
  "/mesas-de-ayuda/edit": "Mesas de ayuda - Editar",
  "/mesas-de-ayuda/asignar": "Mesas de ayuda - Asignar",
  "/oficinas/create": "Oficinas - Crear",
  "/oficinas/edit": "Oficinas - Editar",
  "/inventario-terminales/cubics/create": "Cubics - Crear",
  "/inventario-terminales/cubics/edit": "Cubics - Editar",
};

const MODULE_DEFS: Array<{ name: string; label: string; flags: string[]; sortOrder: number }> = [
  { name: "cronograma", label: "Cronograma", flags: ["canRead", "canWrite", "canViewComments", "canViewTotals"], sortOrder: 1 },
  { name: "asignacion_ag", label: "Asignación de autogestiones", flags: ["canRead", "canWrite"], sortOrder: 2 },
  { name: "calidad", label: "Calidad de operadores", flags: ["canRead", "canWrite", "canViewAll"], sortOrder: 3 },
  { name: "asistencia", label: "Asistencia", flags: ["canRead", "canWrite"], sortOrder: 4 },
  { name: "titulos", label: "Títulos", flags: ["canRead", "canWrite"], sortOrder: 5 },
  { name: "usuarios", label: "Usuarios", flags: ["canRead", "canWrite"], sortOrder: 6 },
];

export async function bootstrapPermissions(): Promise<void> {
  const [existingRoutes] = await db.select({ count: sql<number>`count(*)` }).from(routes);
  if (existingRoutes.count === 0) {
    const seen = new Set<string>();
    for (const r of routePermissions) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      const label = ROUTE_LABELS[r.path] ?? r.path.split("/").filter(Boolean).pop() ?? r.path;
      await db
        .insert(routes)
        .values({ path: r.path, label, sortOrder: seen.size })
        .onConflictDoNothing();
    }
  }

  const [existingModules] = await db.select({ count: sql<number>`count(*)` }).from(modules);
  if (existingModules.count === 0) {
    for (const m of MODULE_DEFS) {
      await db
        .insert(modules)
        .values(m)
        .onConflictDoNothing();
    }
  }

  await loadPermissionsCache(true);
}
