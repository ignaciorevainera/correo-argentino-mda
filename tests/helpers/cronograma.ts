import type { Page } from "@playwright/test";

/**
 * Neutraliza el canal SSR de datos iniciales del cronograma (#267): desde que
 * el primer render embebe el payload real de la DB, los specs que controlan el
 * payload del GET con `page.route` necesitan forzar el fallback del cliente.
 * El setter vacío ignora la asignación del script inline.
 */
export async function ignoreSsrInitialData(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__CRONOGRAMA_INITIAL_DATA__", {
      configurable: true,
      get: () => undefined,
      set: () => {},
    });
  });
}
