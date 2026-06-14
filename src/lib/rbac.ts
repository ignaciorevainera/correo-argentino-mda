export type Role = "admin" | "supervisor" | "referent" | "referente" | "agent";

export interface RoutePermission {
  path: string;
  roles: Role[];
}

export const routePermissions: RoutePermission[] = [
  { path: "/admin/users", roles: ["admin"] },
  { path: "/admin", roles: ["admin", "supervisor"] },
  { path: "/supervision/cronograma", roles: ["admin", "supervisor"] },
  { path: "/supervision", roles: ["admin", "supervisor", "referent", "referente"] },
];

export function hasPermission(path: string, userRole: string): boolean {
  const role = userRole.toLowerCase().trim() as Role;
  
  const matchedRoute = routePermissions
    .filter(route => path.startsWith(route.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!matchedRoute) {
    return true;
  }

  return matchedRoute.roles.includes(role);
}
