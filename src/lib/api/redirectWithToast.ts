import { getBaseNoSlash } from "@lib/baseUrl";

export type ToastType = "success" | "error" | "warning";

export function redirectWithToast(
  path: string,
  message: string,
  type: ToastType = "success"
): Response {
  const cleanBase = getBaseNoSlash();
  const url = `${cleanBase}${path}?toast_msg=${encodeURIComponent(message)}&toast_type=${type}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}
