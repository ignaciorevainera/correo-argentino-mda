import type { APIRoute } from "astro";
import { db } from "@db/index";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { passwordSchema, hashPassword } from "@lib/security";
import { logAdminFromAstro } from "@lib/auditLogger";
import { jsonResponse, jsonError } from "@lib/apiResponse";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || user.id === 0) {
    return jsonError("Sesión no iniciada", 401);
  }

  try {
    const formData = await request.formData();
    const newPassword = formData.get("newPassword")?.toString();

    if (!newPassword) {
      return jsonError("La contraseña es requerida", 400);
    }

    const pwdValidation = passwordSchema.safeParse(newPassword);
    if (!pwdValidation.success) {
      return jsonError(pwdValidation.error.issues[0].message, 400);
    }

    const hashedPassword = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, user.id));

    await logAdminFromAstro(locals, "Blanqueó su propia contraseña");

    return jsonResponse({
      success: true,
      message: "Contraseña actualizada exitosamente",
    });
  } catch (e) {
    console.error("Change password error:", e);
    return jsonError("Error al actualizar la contraseña", 500);
  }
};
