export interface ToastResponseOptions {
  success: boolean;
  message?: string;
  error?: string;
  redirectUrl?: string;
}

export function toastResponse(options: ToastResponseOptions): Response {
  return new Response(JSON.stringify(options), {
    status: options.success ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}
