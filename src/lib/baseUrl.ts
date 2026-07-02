const RAW_BASE = import.meta.env.BASE_URL || "/";

export function getCleanBase(): string {
  return RAW_BASE.endsWith("/") ? RAW_BASE : RAW_BASE + "/";
}

export function getBaseNoSlash(): string {
  return RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;
}
