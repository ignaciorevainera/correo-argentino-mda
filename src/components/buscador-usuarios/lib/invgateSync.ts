import { showToast } from "@lib/toastClient";
import { getCleanBase } from "@lib/baseUrl";

const cleanBase = getCleanBase();

export function svgIcon(name: string, extraClass = ""): string {
  const icon = document.querySelector(
    `#icon-store [data-icon="${name}"] > svg`,
  );
  if (!icon) return "";
  const clone = icon.cloneNode(true) as SVGElement;
  if (extraClass) clone.setAttribute("class", extraClass);
  return clone.outerHTML;
}

export function setSyncIcon(id: string): void {
  [
    "sync-icon-idle",
    "sync-icon-success",
    "sync-icon-error",
    "sync-icon-spinner",
  ].forEach((name) => {
    const el = document.getElementById(name);
    if (el) el.classList.toggle("hidden", el.id !== id);
  });
}

export async function fetchSyncStatus(): Promise<void> {
  const syncStatus = document.getElementById("sync-status");
  if (!syncStatus) return;

  try {
    const res = await fetch(`${cleanBase}api/usuarios/status`);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    if (data.lastSync) {
      const date = new Date(data.lastSync.lastExecution);
      const formatted = date.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const isError = data.lastSync.status === "error";
      syncStatus.innerHTML = `
        ${svgIcon("clock", `size-4 ${isError ? "text-error" : "text-base-content/30"}`)}
        <span>Última sinc.: ${formatted}</span>
        ${isError ? '<span class="text-error font-semibold">(error)</span>' : ""}
      `;
    } else {
      syncStatus.innerHTML = `
        ${svgIcon("clock", "size-4 text-base-content/30")}
        <span>Sin sincronización previa</span>
      `;
    }
  } catch {
    syncStatus.innerHTML = "";
  }

  const syncBtn = document.getElementById("sync-invgate-btn");
  if (syncBtn && window.__userRole === "admin") {
    syncBtn.classList.remove("hidden");
  }
}

export async function handleSyncInvGate(onSyncSuccess?: () => void): Promise<void> {
  const syncBtn = document.getElementById(
    "sync-invgate-btn",
  ) as HTMLButtonElement | null;
  const syncText = document.getElementById(
    "sync-invgate-text",
  ) as HTMLElement | null;
  const searchStatus = document.getElementById("search-status");
  if (!syncBtn || !syncText) return;

  const originalClass =
    "btn btn-accent btn-outline btn-sm mt-1 w-46.25 shrink-0 gap-2";
  const originalText = "Sincronizar InvGate";

  syncBtn.disabled = true;
  syncBtn.className = originalClass + " pointer-events-none";
  syncText.textContent = "Sincronizando...";
  setSyncIcon("sync-icon-spinner");

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 300000);

  try {
    const res = await fetch(`${cleanBase}api/usuarios/sync-invgate`, {
      method: "POST",
      signal: ac.signal,
    });
    const data = await res.json();

    if (data.ok) {
      syncBtn.className = originalClass.replace(
        "btn-accent btn-outline",
        "btn-success",
      );
      setSyncIcon("sync-icon-success");
      syncText.textContent = `Sincronizado (${data.totalSynced})`;

      if (searchStatus) {
        searchStatus.innerHTML = `
          <span class="text-success font-semibold flex items-center gap-1">
            ${svgIcon("check-success")}
            Sincronizado: ${data.totalSynced} usuarios de InvGate
          </span>
        `;
      }
      showToast(`Sincronizados ${data.totalSynced} usuarios de InvGate.`, "alert-success");
      onSyncSuccess?.();

      setTimeout(() => {
        syncBtn.className = originalClass;
        setSyncIcon("sync-icon-idle");
        syncText.textContent = originalText;
      }, 4000);
    } else {
      syncBtn.className = originalClass.replace(
        "btn-accent btn-outline",
        "btn-error",
      );
      setSyncIcon("sync-icon-error");
      syncText.textContent = "Error";

      if (searchStatus) {
        searchStatus.innerHTML = `
          <span class="text-error font-semibold flex items-center gap-1">
            ${svgIcon("x-error")}
            Error: ${data.error || "Error al sincronizar"}
          </span>
        `;
      }
      showToast(data.error || "Error al sincronizar con InvGate.", "alert-error");

      setTimeout(() => {
        syncBtn.className = originalClass;
        setSyncIcon("sync-icon-idle");
        syncText.textContent = originalText;
      }, 4000);
    }
  } catch {
    syncBtn.className = originalClass.replace(
      "btn-accent btn-outline",
      "btn-error",
    );
    setSyncIcon("sync-icon-error");
    syncText.textContent = "Error conexión";

    if (searchStatus) {
      searchStatus.innerHTML = `
        <span class="text-error font-semibold flex items-center gap-1">
          ${svgIcon("x-error")}
          Error de conexión
        </span>
      `;
    }
    showToast("Error de conexión al sincronizar con InvGate.", "alert-error");

    setTimeout(() => {
      syncBtn.className = originalClass;
      setSyncIcon("sync-icon-idle");
      syncText.textContent = originalText;
    }, 4000);
  } finally {
    clearTimeout(timeout);
    syncBtn.disabled = false;
  }
}

export function initInvgateSync(onSyncSuccess?: () => void): void {
  const syncBtn = document.getElementById("sync-invgate-btn");
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      handleSyncInvGate(onSyncSuccess);
    });
  }
  fetchSyncStatus();
}
