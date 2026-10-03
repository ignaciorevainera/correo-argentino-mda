import { navigate } from "astro:transitions/client";

/**
 * Recarga el detalle de una automatización forzando un re-resolve server-side.
 *
 * Tras una mutación local (guardar datos manuales, cerrar o reabrir) hay que
 * ver el dato nuevo, pero el cache en memoria del detalle (TTL corto) puede
 * seguir sirviendo la versión vieja — sobre todo en dev, donde las actions y la
 * página pueden no compartir la misma instancia del resolver. Navegamos con
 * `?refresh=1`: el servidor limpia el cache de ese id antes de resolver.
 *
 * Deja la URL limpia (sin el `refresh`) cuando termina la navegación.
 */
export async function refreshAutomationDetail(): Promise<void> {
  const url = new URL(window.location.href);
  url.searchParams.set("refresh", "1");
  await navigate(`${url.pathname}${url.search}`);

  const clean = new URL(window.location.href);
  if (clean.searchParams.get("refresh") === "1") {
    clean.searchParams.delete("refresh");
    window.history.replaceState(
      window.history.state,
      "",
      `${clean.pathname}${clean.search}${clean.hash}`,
    );
  }
}
