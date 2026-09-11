export function buildQueryString(
  params: Record<string, string | null | undefined>
): string {
  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== null && val !== undefined && val !== "" && val !== "all") {
      searchParams.set(key, val);
    }
  }
  return searchParams.toString();
}

export function updateBrowserUrl(queryString: string): void {
  if (typeof window === "undefined") return;
  const cleanQs = queryString.startsWith("?")
    ? queryString.slice(1)
    : queryString;
  const newUrl = cleanQs
    ? `${window.location.pathname}?${cleanQs}`
    : window.location.pathname;
  window.history.replaceState({}, "", newUrl);
}

export function updateCsvExportHref(
  btnId: string,
  baseEndpoint: string,
  queryString: string
): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById(btnId);
  if (!element) return;
  const cleanQs = queryString.startsWith("?")
    ? queryString.slice(1)
    : queryString;
  const separator = baseEndpoint.includes("?") ? "&" : "?";
  const href = cleanQs ? `${baseEndpoint}${separator}${cleanQs}` : baseEndpoint;
  element.setAttribute("href", href);
}
