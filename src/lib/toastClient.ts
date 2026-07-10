export type ToastType = 'alert-info' | 'alert-success' | 'alert-warning' | 'alert-error';

const CLASS_MAP: Record<ToastType, string> = {
  'alert-success': 'alert-success text-success-content',
  'alert-error': 'alert-error text-error-content',
  'alert-warning': 'alert-warning text-warning-content',
  'alert-info': 'alert-info text-info-content'
};

const TEMPLATE_MAP: Record<ToastType, string> = {
  'alert-success': 'template-success',
  'alert-error': 'template-error',
  'alert-warning': 'template-warning',
  'alert-info': 'template-info'
};

export function showToast(message: string, type: ToastType = 'alert-info', durationMs: number = 3000) {
  const container = document.getElementById('global-toast-container');
  if (!container) return;

  const validTypes: ToastType[] = ['alert-info', 'alert-success', 'alert-warning', 'alert-error'];
  const resolvedType = validTypes.includes(type) ? type : 'alert-info';

  const toastDiv = document.createElement('div');
  toastDiv.className = `alert ${CLASS_MAP[resolvedType]} shadow-xl rounded-2xl border border-base-content/5 flex items-center gap-3 text-sm font-semibold slide-in-right`;

  const templateId = TEMPLATE_MAP[resolvedType];
  const templateContainer = document.getElementById(templateId);
  if (templateContainer) {
    const iconSvg = templateContainer.querySelector('svg');
    if (iconSvg) {
      const clonedSvg = iconSvg.cloneNode(true) as SVGElement;
      clonedSvg.classList.add('shrink-0');
      toastDiv.appendChild(clonedSvg);
    }
  }

  const span = document.createElement('span');
  span.textContent = message;
  toastDiv.appendChild(span);

  container.appendChild(toastDiv);

  setTimeout(() => {
    toastDiv.classList.replace('slide-in-right', 'slide-out-right');
    toastDiv.addEventListener('animationend', () => {
      toastDiv.remove();
    });
  }, durationMs);
}
