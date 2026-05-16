// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { db } from "./db/index"; // Asegúrate de que la ruta sea correcta
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url, redirect, locals } = context;
  const path = url.pathname;

  // 1. Variables por defecto para un usuario anónimo (Agente)
  let currentUser = {
    id: 0,
    username: "Usuario",
    role: "agent",
  };

  // 2. Verificamos si existe una sesión activa
  const sessionUsername = cookies.get("mda_session")?.value;

  if (sessionUsername) {
    // Si hay cookie, buscamos al usuario en la BD
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, sessionUsername));

    if (dbUser) {
      currentUser = dbUser; // Sobrescribimos el usuario anónimo
    } else {
      cookies.delete("mda_session"); // Borramos la cookie si el usuario ya no existe
    }
  }

  // 3. SIEMPRE inyectamos el usuario en "locals" ANTES de cualquier redirección
  locals.user = currentUser;

  // 4. Si la ruta es el login, dejamos que la página cargue normalmente sin chequear roles
  if (path === "/login") {
    return next();
  }

  const role = currentUser.role;

  // --- REGLAS DE PROTECCIÓN DE RUTAS ---

  // --- REGLAS DE PROTECCIÓN DE RUTAS ---

  // Regla 1: Panel de Administración y Design System (Solo Admin)
  if (
    (path.startsWith("/admin") || path.startsWith("/design-system")) &&
    role !== "admin"
  ) {
    return redirect("/login");
  }

  // Regla 2: Rutas dentro de /supervision/
  if (path.startsWith("/supervision")) {
    // Excepción: Autogestiones (Pueden entrar Referentes, Supervisores y Admins)
    if (path.startsWith("/supervision/asignacion-autogestiones")) {
      if (!["referent", "supervisor", "admin"].includes(role)) {
        return redirect("/login");
      }
    }
    // El resto de la carpeta /supervision (calidad-operadores, cronograma, etc.)
    else {
      // Solo Supervisores y Admins
      if (!["supervisor", "admin"].includes(role)) {
        return redirect("/login");
      }
    }
  }

  // Si no choca con ninguna regla, lo dejamos ver la página
  return next();
});
