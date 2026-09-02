// View mode types for Enlaces page
export type ViewMode = "compact" | "normal" | "large";

export const VIEW_MODE_KEY = "enlacesViewMode";

export const VIEW_MODES: ViewMode[] = ["compact", "normal", "large"];

export const DEFAULT_VIEW_MODE: ViewMode = "normal";

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
