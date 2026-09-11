import { getBaseNoSlash } from "@lib/baseUrl";
import { showToast } from "@lib/toastClient";

let isInvgateSyncing = false;

export async function handleInvgateSync(): Promise<void> {
  if (isInvgateSyncing) return;
  isInvgateSyncing = true;

  const btn = document.getElementById(
    "sync-invgate-btn",
  ) as HTMLButtonElement | null;
  const text = document.getElementById("sync-btn-text");
  const spinner = document.getElementById("sync-btn-spinner");
  if (!btn || !text || !spinner) {
    isInvgateSyncing = false;
    return;
  }

  text.textContent = "Sincronizando...";
  spinner.classList.remove("hidden");

  try {
    const baseUrl = getBaseNoSlash();
    const res = await fetch(`${baseUrl}/api/admin/invgate/locations/sync`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.ok) {
      showToast(
        `Sincronización completada: ${data.matched} oficinas vinculadas`,
        "alert-success",
      );
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showToast(data.error || "Error al sincronizar", "alert-error");
    }
  } catch {
    showToast("Error de red al sincronizar", "alert-error");
  } finally {
    isInvgateSyncing = false;
    text.textContent = "Sincronizar ahora";
    spinner.classList.add("hidden");
  }
}

export async function loadInvgateStats(): Promise<void> {
  const statsCards = document.getElementById("stats-cards");
  if (!statsCards) return;

  try {
    const baseUrl = getBaseNoSlash();
    const res = await fetch(`${baseUrl}/api/invgate/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();
    const setStat = (id: string, val: number | undefined | null) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val != null ? String(val) : "—";
    };
    setStat("stat-totalMda", stats.totalMda);
    setStat("stat-matched", stats.matched);
    setStat("stat-unmatchedMda", stats.unmatchedMda);
    setStat("stat-unmatchedInvgate", stats.unmatchedInvgate);
  } catch (err) {
    console.error("Error loading InvGate stats:", err);
  }
}

export function initOfficeInvgate(): void {
  document
    .getElementById("sync-invgate-btn")
    ?.addEventListener("click", handleInvgateSync);
  loadInvgateStats();
}
