import { getCleanBase } from "./baseUrl";

export function resolveUrl(path: string, base?: string): string {
  if (base !== undefined) {
    const b = base.endsWith("/") ? base : base + "/";
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${b}${cleanPath}`;
  }
  return `${getCleanBase()}${path.startsWith("/") ? path.slice(1) : path}`;
}
