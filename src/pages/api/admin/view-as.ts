import type { APIRoute } from "astro";
import { normalizeRole } from "@lib/rbac";
import { validateRequestCsrf } from "@lib/csrf";
import { isSessionCookieSecure } from "@lib/session";
import {
  getViewProfile,
  VIEW_AS_COOKIE,
  VIEW_AS_MAX_AGE_SECONDS,
} from "@lib/viewSimulation";
import { redirectWithToast } from "@lib/api/redirectWithToast";

/**
 * Simulador de vista ("ver como"): setea o limpia la cookie `view_as`.
 *
 * Sólo el admin real puede usarlo y la cookie únicamente se aplica a la capa de
 * presentación (nunca a la autorización real).
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;
  if (!user || user.id === 0 || normalizeRole(user.role) !== "admin") {
    return new Response("Solo un administrador puede simular vistas", {
      status: 403,
    });
  }

  const isCsrfValid = await validateRequestCsrf(request, locals);
  if (!isCsrfValid) {
    return new Response("CSRF validation failed", { status: 403 });
  }

  const form = await request.formData();
  const profileId = String(form.get("profile") ?? "").trim();

  if (profileId === "" || profileId === "none") {
    cookies.delete(VIEW_AS_COOKIE, {
      path: "/",
      httpOnly: true,
      secure: isSessionCookieSecure(),
      sameSite: "lax",
    });
    return redirectWithToast("/", "Vista real restaurada");
  }

  const profile = getViewProfile(profileId);
  if (!profile) {
    return new Response("Perfil de vista inválido", { status: 400 });
  }

  cookies.set(VIEW_AS_COOKIE, profile.id, {
    path: "/",
    httpOnly: true,
    secure: isSessionCookieSecure(),
    sameSite: "lax",
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
  });

  return redirectWithToast("/", `Viendo como ${profile.label}`);
};

export const GET: APIRoute = async () =>
  new Response("Method Not Allowed. Use POST.", {
    status: 405,
    headers: { Allow: "POST" },
  });
