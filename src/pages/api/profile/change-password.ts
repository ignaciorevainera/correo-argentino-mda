import type { APIRoute } from "astro";
import { db } from "@db/index";
import { sessions, users } from "@db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { passwordSchema, hashPassword } from "@lib/security";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { validateRequestCsrf, validateCsrfToken } from "@lib/csrf";
import { deleteSessionCookie } from "@lib/session";
import { invalidateUserSessionsCache } from "@lib/sessionCache";
import { resolveUrl } from "@lib/url";

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const user = locals.user;
  if (!user || user.id === 0) {
    return jsonError("Sesión no iniciada", 401);
  }

  try {
    let isCsrfValid = await validateRequestCsrf(request, locals);
    const formData = await request.formData();

    if (!isCsrfValid && locals.sessionId) {
      const formToken = formData.get("csrf_token")?.toString();
      if (formToken && validateCsrfToken(formToken, locals.sessionId)) {
        isCsrfValid = true;
      }
    }

    if (!isCsrfValid) {
      return jsonError("Token CSRF inválido o ausente", 403);
    }

    const currentPassword = formData.get("currentPassword")?.toString();
    const newPassword = formData.get("newPassword")?.toString();

    if (!currentPassword) {
      return jsonError("La contraseña actual es requerida", 400);
    }

    if (!newPassword) {
      return jsonError("La nueva contraseña es requerida", 400);
    }

    const pwdValidation = passwordSchema.safeParse(newPassword);
    if (!pwdValidation.success) {
      return jsonError(pwdValidation.error.issues[0].message, 400);
    }

    const [dbUser] = await db
      .select({ password: users.password, authProvider: users.authProvider })
      .from(users)
      .where(eq(users.id, user.id));

    if (!dbUser) {
      return jsonError("Usuario no encontrado", 404);
    }

    if (dbUser.authProvider !== "local" || !dbUser.password) {
      return jsonError("Las cuentas federadas o administradas externamente (Azure AD) deben gestionar su contraseña en el portal corporativo.", 403);
    }

    const isCurrentValid = await bcrypt.compare(
      currentPassword,
      dbUser.password,
    );
    if (!isCurrentValid) {
      return jsonError("La contraseña actual es incorrecta", 400);
    }

    const hashedPassword = await hashPassword(newPassword);
    db.transaction((tx) => {
      tx.update(users)
        .set({ password: hashedPassword, passwordChangedAt: new Date() })
        .where(eq(users.id, user.id))
        .run();

      // Se cierran TODAS las sesiones, incluida la actual: el cambio de clave
      // invalida el acceso de inmediato y obliga a reautenticarse.
      tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
    });

    invalidateUserSessionsCache(user.id);
    deleteSessionCookie(cookies);

    await logAdminFromAstro(locals, "Cambió su propia contraseña");

    return jsonResponse({
      success: true,
      message: "Contraseña actualizada. Iniciá sesión nuevamente.",
      redirectUrl: resolveUrl(
        `/login?toast_msg=${encodeURIComponent("Contraseña actualizada. Iniciá sesión nuevamente.")}&toast_type=success`,
      ),
    });
  } catch (e) {
    console.error("Change password error:", e);
    return jsonError("Error al actualizar la contraseña", 500);
  }
};
