/**
 * HTML builders que replican el contrato de clases de los componentes Astro
 * ActionEditButton / ActionDeleteButton (variante xs).
 * Necesarios porque estos botones se generan en template strings de TS,
 * donde no se pueden instanciar componentes .astro.
 */

const PENCIL_FILLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.38 15.95c-.13.13-.22.29-.26.46l-1.08 4.34c-.09.34.01.7.26.95c.19.19.45.29.71.29c.08 0 .16 0 .24-.03l4.34-1.09c.18-.04.34-.13.46-.26L18.2 10.46l-4.67-4.67zM19.67 2.61c-.81-.81-2.14-.81-2.95 0l-1.78 1.78l4.67 4.67l1.78-1.78c.81-.81.81-2.13 0-2.95z"/></svg>`;

const TRASH_FILLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 6V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H2v2h2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8h2V6zM9 4h6v2H9zm1 14H8v-8h2zm6 0h-2v-8h2z"/></svg>`;

export function actionEditButtonHtml(options: {
  ariaLabel: string;
  attrs?: string;
  actionClass?: string;
}): string {
  return `<button type="button" class="btn btn-xs btn-soft btn-secondary gap-2 ${options.actionClass ?? ""}" aria-label="${options.ariaLabel}" ${options.attrs ?? ""}>${PENCIL_FILLED_SVG}</button>`;
}

export function actionDeleteButtonHtml(options: {
  ariaLabel: string;
  attrs?: string;
  actionClass?: string;
}): string {
  return `<button type="button" class="btn btn-xs btn-soft btn-error gap-2 ${options.actionClass ?? ""}" aria-label="${options.ariaLabel}" ${options.attrs ?? ""}>${TRASH_FILLED_SVG}</button>`;
}
