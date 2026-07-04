import { store, type AttendanceRecord } from "./store";
import { complianceClasses, complianceLabels, attendanceClasses, ausenciaClasses } from "./utils";

export const dom = {
  isRowBeingEdited(agentId: number): boolean {
    const active = document.activeElement;
    if (!active) return false;
    const row = active.closest(`tr[data-agent-id="${agentId}"]`);
    return row !== null;
  },

  updateRow(agentId: number, record: AttendanceRecord) {
    const row = document.querySelector(`tr[data-agent-id="${agentId}"]`) as HTMLElement;
    if (!row) return;

    // 1. Asistencia Real Select
    const selectAsistencia = row.querySelector('[data-field="asistencia"]') as HTMLSelectElement;
    if (selectAsistencia && selectAsistencia.value !== record.asistencia) {
      selectAsistencia.value = record.asistencia;
      this.updateSelectColor(selectAsistencia, "asistencia");
    }

    // 2. Ausencia Select
    const selectAusencia = row.querySelector('[data-field="ausencia"]') as HTMLSelectElement;
    if (selectAusencia && selectAusencia.value !== record.ausencia) {
      selectAusencia.value = record.ausencia;
      this.updateSelectColor(selectAusencia, "ausencia");
    }

    // 3. Entrada Real Input
    const inputEntrada = row.querySelector('[data-field="entradaReal"]') as HTMLInputElement;
    if (inputEntrada && inputEntrada.value !== record.entradaReal) {
      inputEntrada.value = record.entradaReal;
    }

    // 4. Cumplimiento Badge and Select
    const badge = document.getElementById(`badge-cump-${agentId}`);
    if (badge) {
      const finalCump = record.cumplimiento;
      badge.textContent = complianceLabels[finalCump] || finalCump;
      badge.className = `badge badge-sm py-2 px-3 rounded-lg text-tiny whitespace-nowrap ${complianceClasses[finalCump] || "badge-ghost"}`;
    }

    const selectCumplimiento = row.querySelector('[data-field="cumplimiento"]') as HTMLSelectElement;
    if (selectCumplimiento) {
      const expectedValue = record.cumplimientoForzado ? record.cumplimiento : "";
      if (selectCumplimiento.value !== expectedValue) {
        selectCumplimiento.value = expectedValue;
      }
    }

    // 5. Details Row elements (Motivo Login & Detalle)
    const detailsRow = document.getElementById(`details-row-${agentId}`);
    if (detailsRow) {
      const inputMotivo = detailsRow.querySelector('[data-field="motivoLoguin"]') as HTMLInputElement;
      if (inputMotivo && inputMotivo.value !== record.motivoLoguin) {
        inputMotivo.value = record.motivoLoguin;
      }

      const inputDetalle = detailsRow.querySelector('[data-field="detalle"]') as HTMLTextAreaElement;
      if (inputDetalle && inputDetalle.value !== record.detalle) {
        inputDetalle.value = record.detalle;
      }
    }
  },

  updateSelectColor(selectEl: HTMLSelectElement, field: "asistencia" | "ausencia" = "asistencia") {
    const val = selectEl.value;
    const baseClass = "select select-bordered h-9 py-1 rounded-xl w-full font-semibold focus:outline-none focus:border-secondary bg-base-100 pr-9 text-small ";
    
    if (field === "asistencia") {
      selectEl.className = baseClass + "max-w-[220px]";
      const classes = attendanceClasses[val];
      if (classes) classes.forEach((c) => selectEl.classList.add(c));
    } else {
      selectEl.className = baseClass + "max-w-[170px]";
      const classes = ausenciaClasses[val];
      if (classes) classes.forEach((c) => selectEl.classList.add(c));
    }
  },

  showSyncStatus(status: "saving" | "saved" | "syncing" | "synced" | "error" | "idle", errorMsg?: string) {
    const statusBar = document.getElementById("sync-status-bar");
    if (!statusBar) return;

    statusBar.classList.remove("opacity-0", "translate-y-32", "pointer-events-none");
    statusBar.classList.add("opacity-100", "translate-y-0");

    const textEl = statusBar.querySelector("#sync-status-text");
    const iconContainer = statusBar.querySelector("#sync-status-icon");

    if (!textEl || !iconContainer) return;

    let text = "";
    let iconHTML = "";
    let barColor = "border-base-300";

    switch (status) {
      case "saving":
        text = "Guardando cambios automáticamente...";
        iconHTML = `<span class="loading loading-spinner loading-xs text-secondary"></span>`;
        barColor = "border-secondary/40 shadow-[0_4px_20px_rgba(var(--color-secondary-rgb,147,51,234),0.1)]";
        break;
      case "saved":
        text = "Todos los cambios guardados.";
        iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="0" d="M5 13l4 4L19 7" /></svg>`;
        barColor = "border-success/40 shadow-[0_4px_20px_rgba(34,197,94,0.1)]";
        setTimeout(() => {
          if (store.dirtyAgents.size === 0) {
            this.hideSyncStatus();
          }
        }, 3000);
        break;
      case "syncing":
        text = "Buscando cambios de otros supervisores...";
        iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 animate-spin text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>`;
        barColor = "border-info/40";
        break;
      case "synced":
        text = "Tabla sincronizada en tiempo real.";
        iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
        barColor = "border-success/40";
        setTimeout(() => {
          this.hideSyncStatus();
        }, 3000);
        break;
      case "error":
        text = `Error al guardar: ${errorMsg || "Conexión fallida"}`;
        iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
        barColor = "border-error/40 shadow-[0_4px_20px_rgba(239,68,68,0.1)]";
        break;
      case "idle":
        this.hideSyncStatus();
        return;
    }

    textEl.textContent = text;
    iconContainer.innerHTML = iconHTML;
    
    // Reset border classes and apply new one
    statusBar.className = `fixed bottom-6 left-1/2 -translate-x-1/2 bg-base-100/95 backdrop-blur-xl rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] border p-3.5 flex items-center justify-between gap-6 z-100 transition-all duration-300 w-[90%] max-w-md ${barColor}`;
  },

  hideSyncStatus() {
    const statusBar = document.getElementById("sync-status-bar");
    if (!statusBar) return;
    statusBar.classList.add("opacity-0", "translate-y-32", "pointer-events-none");
    statusBar.classList.remove("opacity-100", "translate-y-0");
  }
};
