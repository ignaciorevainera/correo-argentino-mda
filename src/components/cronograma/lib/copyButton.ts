import { exportAsClipboardImage } from "./exporters";
import { showToast } from "./notifications";

const SPINNER = `<span class="loading loading-spinner loading-xs"></span><span>Copiando...</span>`;
const SUCCESS = `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg><span>¡Copiado!</span>`;

export interface CopyImageOptions {
  padding?: number;
  compact?: boolean;
  width?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface CopyMessages {
  success: string;
  clipboardUnavailable: string;
  error: string;
}

export async function copyElementImageToClipboard(
  btn: HTMLButtonElement | null,
  target: HTMLElement | null,
  opts: CopyImageOptions,
  messages: CopyMessages,
  baseClass = "btn-secondary",
): Promise<void> {
  if (!btn || !target) return;
  const original = btn.innerHTML;
  try {
    btn.disabled = true;
    btn.innerHTML = SPINNER;
    await exportAsClipboardImage(
      target,
      opts,
      opts.onStart,
      opts.onEnd,
    );
    btn.classList.remove(baseClass);
    btn.classList.add("btn-success");
    btn.innerHTML = SUCCESS;
    showToast(messages.success, "success");
    setTimeout(() => {
      btn.classList.remove("btn-success");
      btn.classList.add(baseClass);
      btn.disabled = false;
      btn.innerHTML = original;
    }, 2500);
  } catch (error: any) {
    console.error("copyElementImageToClipboard failed:", error);
    if (error?.message === "CLIPBOARD_UNAVAILABLE_DOWNLOADED") {
      showToast(messages.clipboardUnavailable, "warning");
    } else {
      showToast(messages.error, "error");
    }
    btn.disabled = false;
    btn.innerHTML = original;
  }
}
