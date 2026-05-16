// src/pages/logout.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ cookies, redirect }) => {
  // Eliminamos la cookie de sesión
  cookies.delete("mda_session", { path: "/" });

  // Redirigimos al inicio (que ahora tratará al usuario como un "agent" anónimo)
  return redirect("/");
};
