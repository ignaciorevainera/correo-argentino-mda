// View mode types for Enlaces page
export type ViewMode = "compact" | "normal" | "large";

export const VIEW_MODE_KEY = "enlacesViewMode";

export const VIEW_MODES: ViewMode[] = ["compact", "normal", "large"];

export const DEFAULT_VIEW_MODE: ViewMode = "normal";

export type ViewColumns = 1 | 2 | 3 | 4;

export const VIEW_COLUMNS_KEY = "enlacesViewColumns";

export const VIEW_COLUMNS: ViewColumns[] = [1, 2, 3, 4];

export const DEFAULT_VIEW_COLUMNS: ViewColumns = 3;

export function safeGetItem(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // silently fail (private browsing)
  }
}

export function getViewMode(): ViewMode {
  const stored = safeGetItem(VIEW_MODE_KEY, DEFAULT_VIEW_MODE);
  return VIEW_MODES.includes(stored as ViewMode)
    ? (stored as ViewMode)
    : DEFAULT_VIEW_MODE;
}

export function setViewMode(mode: ViewMode): void {
  safeSetItem(VIEW_MODE_KEY, mode);
}

export function getViewColumns(): ViewColumns {
  const stored = safeGetItem(VIEW_COLUMNS_KEY, String(DEFAULT_VIEW_COLUMNS));
  const parsed = Number(stored);
  return VIEW_COLUMNS.includes(parsed as ViewColumns)
    ? (parsed as ViewColumns)
    : DEFAULT_VIEW_COLUMNS;
}

export function setViewColumns(columns: ViewColumns): void {
  safeSetItem(VIEW_COLUMNS_KEY, String(columns));
}
