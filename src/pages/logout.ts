import type { APIRoute } from "astro";

export const GET: APIRoute = ({ cookies, redirect }) => {
  cookies.delete("mda_session", { path: "/" });

  return redirect("/");
};
