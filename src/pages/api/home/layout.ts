import type { APIRoute } from "astro";
import { db } from "@db/index";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { validateRequestCsrf } from "@lib/csrf";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { getSessionAgent } from "@lib/inicio/sessionAgent";
import { resolveHomeProfile, type HomeProfile } from "@lib/inicio/homeProfile";
import { getHomeAccessEntries, getHomeTopCardRoutes } from "@lib/profileAccess";
import { normalizeRole } from "@lib/rbac";
import {
  allowedWidgetsFor,
  defaultLayout,
  isDashboardWidget,
  parseStoredDashboard,
  type DashboardWidgetId,
} from "@lib/inicio/dashboardLayout";

const HOME_PROFILES: HomeProfile[] = [
  "admin",
  "supervisor",
  "referente",
  "calidad",
  "operador",
  "base",
];

const isHomeProfile = (value: string): value is HomeProfile =>
  (HOME_PROFILES as string[]).includes(value);

/**
 * Guarda el layout configurable del home de un perfil
 * (`{ big, side: [chica, mediana] }`) o lo restablece con `action=reset`.
 *
 * - Un usuario común sólo puede guardar el layout de su perfil real.
 * - Un admin puede guardar el de su perfil real y el del perfil que está
 *   simulando.
 * - La lista blanca depende del rol efectivo (jerarquía) y se revalida acá.
 * - Si la columna queda incompleta, se autocompleta: cambiar un solo widget
 *   nunca falla.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || user.id === 0) {
    return new Response("Sesión no iniciada", { status: 401 });
  }

  const isCsrfValid = await validateRequestCsrf(request, locals);
  if (!isCsrfValid) {
    return new Response("CSRF validation failed", { status: 403 });
  }

  const agent = await getSessionAgent(user);
  const realProfile = resolveHomeProfile({ role: user.role, agent });
  const viewProfile = locals.viewAs?.homeProfile ?? null;

  const form = await request.formData();
  const requested = String(form.get("profile") ?? "").trim();
  const targetProfile: HomeProfile = isHomeProfile(requested)
    ? requested
    : (viewProfile ?? realProfile);

  const allowedTargets = new Set<HomeProfile>([realProfile]);
  if (viewProfile) allowedTargets.add(viewProfile);
  if (!allowedTargets.has(targetProfile)) {
    return redirectWithToast(
      "/",
      "No podés configurar la vista de ese perfil",
      "error",
    );
  }

  const viewRole = locals.viewAs?.role ?? user.role;
  const allowed = allowedWidgetsFor(targetProfile, viewRole);
  const action = String(form.get("action") ?? "save");

  // Accesos de abajo permitidos para el rol efectivo (misma lista que el home).
  const effectiveMesa = user.helpdeskName ?? (locals.viewAs ? "TI_GSM_MDA TI" : null);
  const permittedAccess = getHomeAccessEntries(
    viewRole,
    effectiveMesa,
    getHomeTopCardRoutes(viewRole),
  ).map((entry) => entry.href);

  const [row] = await db
    .select({ dashboardLayout: users.dashboardLayout })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const store = parseStoredDashboard(row?.dashboardLayout ?? null, realProfile);

  if (action === "reset") {
    delete store.profiles[targetProfile];
    delete store.accessByRole[normalizeRole(viewRole)];
    await db
      .update(users)
      .set({ dashboardLayout: store })
      .where(eq(users.id, user.id));
    return redirectWithToast("/", "Inicio restablecido");
  }

  const rawBig = String(form.get("big") ?? "");
  const defaults = defaultLayout(targetProfile);
  let sanitized = false;

  const requestedBig =
    isDashboardWidget(rawBig) && allowed.includes(rawBig) ? rawBig : null;
  if (rawBig && !requestedBig) sanitized = true;

  const big: DashboardWidgetId | null =
    requestedBig ??
    (defaults && allowed.includes(defaults.big)
      ? defaults.big
      : (allowed[0] ?? null));

  if (!big) {
    return redirectWithToast("/", "Tu perfil no tiene widgets disponibles", "error");
  }

  const side: DashboardWidgetId[] = [];
  const push = (candidate: DashboardWidgetId) => {
    if (side.length >= 2) return;
    if (candidate === big || side.includes(candidate)) return;
    if (!allowed.includes(candidate)) return;
    side.push(candidate);
  };

  for (const raw of [form.get("side1"), form.get("side2")]) {
    const value = String(raw ?? "");
    if (!value) continue;
    if (!isDashboardWidget(value) || !allowed.includes(value)) {
      sanitized = true;
      continue;
    }
    push(value);
  }
  // Autocompletar: default del perfil y, si falta, la lista blanca.
  for (const candidate of defaults?.side ?? []) push(candidate);
  for (const candidate of allowed) push(candidate);

  if (side.length < 2) {
    return redirectWithToast(
      "/",
      "No hay suficientes widgets para completar la columna",
      "error",
    );
  }

  store.profiles[targetProfile] = { big, side };

  // Accesos de abajo: sólo se tocan si el formulario envió esa sección.
  if (String(form.get("access_configured") ?? "") === "1") {
    const permittedSet = new Set(permittedAccess);
    const access: string[] = [];
    for (const raw of form.getAll("access")) {
      const href = String(raw ?? "");
      if (!permittedSet.has(href) || access.includes(href)) continue;
      access.push(href);
    }
    store.accessByRole[normalizeRole(viewRole)] = access;
  }

  await db
    .update(users)
    .set({ dashboardLayout: store })
    .where(eq(users.id, user.id));

  return redirectWithToast(
    "/",
    sanitized
      ? "Configuración ajustada a los widgets permitidos"
      : "Inicio actualizado",
    sanitized ? "warning" : "success",
  );
};

export const GET: APIRoute = async () =>
  new Response("Method Not Allowed. Use POST.", {
    status: 405,
    headers: { Allow: "POST" },
  });
