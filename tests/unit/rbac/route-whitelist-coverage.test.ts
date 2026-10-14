// Anti-drift del default-deny de `src/lib/rbac.ts`: toda ruta bajo /api/ que
// no matchee ninguna entrada de `routePermissions` es denegada, y el middleware
// responde con un redirect 302 al home (HTML) en vez de un 401/403 JSON. Eso
// rompe los fetch() del cliente con "Respuesta no JSON (200 text/html)".
//
// Este test no valida el ROL (eso vive en requireRead/WriteAccess por endpoint,
// y en los /api/* admin-only como /api/kb/upload): solo que cada grupo de
// endpoints tenga una entrada en la whitelist.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routePermissions } from "@lib/rbac";

/** Rutas de todos los endpoints bajo src/pages/api (sin extensión). */
function apiEndpoints(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return apiEndpoints(join(dir, e.name), `${prefix}/${e.name}`);
    if (!/\.(ts|js|mts)$/.test(e.name)) return [];
    return [`${prefix}/${e.name.replace(/\.(ts|js|mts)$/, "")}`];
  });
}

const apiGroups = apiEndpoints(join(process.cwd(), "src", "pages", "api"), "/api");

describe("rbac routePermissions cubre todos los grupos de /api", () => {
  it("ningún endpoint bajo /api/ queda fuera de la whitelist", () => {
    const denied = apiGroups.filter(
      (p) =>
        !routePermissions.some((r) => p.startsWith(r.path.toLowerCase())),
    );
    expect(denied).toEqual([]);
  });
});