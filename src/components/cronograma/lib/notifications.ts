import { showToast as globalShowToast, type ToastType } from "@lib/toastClient";

export function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
  const typeMap: Record<'success' | 'error' | 'warning' | 'info', ToastType> = {
    success: 'alert-success',
    error: 'alert-error',
    warning: 'alert-warning',
    info: 'alert-info'
  };
  globalShowToast(message, typeMap[type] || 'alert-info');
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'modal modal-bottom sm:modal-middle z-[250] modal-open';
    dialog.innerHTML = `
      <div class="modal-box max-w-sm bg-base-100 border border-base-300 shadow-2xl rounded-3xl">
        <h3 class="font-black text-lg mb-3 text-base-content uppercase tracking-tight">Confirmar Acción</h3>
        <p class="text-sm text-base-content/70">${message}</p>
        <div class="modal-action mt-6 flex justify-end gap-2">
          <button class="btn btn-sm btn-ghost hover:bg-base-200 text-xs font-black uppercase" id="confirm-cancel-btn" type="button">Cancelar</button>
          <button class="btn btn-sm btn-secondary text-xs font-black uppercase" id="confirm-ok-btn" type="button">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#confirm-cancel-btn');
    const okBtn = dialog.querySelector('#confirm-ok-btn');

    const cleanUp = (value: boolean) => {
      dialog.classList.remove('modal-open');
      dialog.remove();
      resolve(value);
    };

    cancelBtn?.addEventListener('click', () => cleanUp(false));
    okBtn?.addEventListener('click', () => cleanUp(true));
    dialog.addEventListener('close', () => cleanUp(false));
  });
}

export function showPrompt(message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'modal modal-bottom sm:modal-middle z-[250] modal-open';
    dialog.innerHTML = `
      <div class="modal-box max-w-sm bg-base-100 border border-base-300 shadow-2xl rounded-3xl">
        <h3 class="font-black text-lg mb-3 text-base-content uppercase tracking-tight">Ingresar Valor</h3>
        <p class="text-sm text-base-content/70 mb-4">${message}</p>
        <input type="text" id="prompt-input-field" class="input input-bordered w-full input-sm rounded-xl text-sm" value="${defaultValue}" />
        <div class="modal-action mt-6 flex justify-end gap-2">
          <button class="btn btn-sm btn-ghost hover:bg-base-200 text-xs font-black uppercase" id="prompt-cancel-btn" type="button">Cancelar</button>
          <button class="btn btn-sm btn-secondary text-xs font-black uppercase" id="prompt-ok-btn" type="button">Aceptar</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#prompt-cancel-btn');
    const okBtn = dialog.querySelector('#prompt-ok-btn');
    const inputField = dialog.querySelector('#prompt-input-field') as HTMLInputElement | null;

    // Focus input field and select all text
    setTimeout(() => {
      if (inputField) {
        inputField.focus();
        inputField.select();
      }
    }, 50);

    const cleanUp = (value: string | null) => {
      dialog.classList.remove('modal-open');
      dialog.remove();
      resolve(value);
    };

    cancelBtn?.addEventListener('click', () => cleanUp(null));
    okBtn?.addEventListener('click', () => {
      const val = inputField ? inputField.value : '';
      cleanUp(val);
    });
    
    // Support Enter key
    inputField?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = inputField ? inputField.value : '';
        cleanUp(val);
      }
    });

    dialog.addEventListener('close', () => cleanUp(null));
  });
}

