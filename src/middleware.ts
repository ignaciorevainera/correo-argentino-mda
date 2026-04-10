import type { MiddlewareHandler } from "astro";

const PRIVATE_ROUTES = [
  "/buscador-usuarios",
  "/oficinas-telegrafia",
  "/cubics",
  "/configuracion",
];

// Cambiar a true cuando se termine la implementacion real de login.
const PRIVATE_ROUTE_GUARD_ENABLED = false;

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (!PRIVATE_ROUTE_GUARD_ENABLED) {
    return next();
  }

  const path = context.url.pathname;
  const isPrivateRoute = PRIVATE_ROUTES.some((route) =>
    path === route || path.startsWith(`${route}/`),
  );

  if (!isPrivateRoute) {
    return next();
  }

  // TODO: Leer cookie/sesión real de Supabase Auth.
  // TODO: Reemplazar esta validacion placeholder por getUser/getSession en server.
  const hasSupabaseSession = false;

  if (!hasSupabaseSession) {
    return context.redirect("/login");
  }

  return next();
};
