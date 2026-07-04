import { store, type AttendanceRecord } from "./store";
import { dom } from "./dom";
import { fetchAttendanceData } from "./api";

let syncInterval: any = null;

export function startSync(date: string, intervalMs = 5000) {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    try {
      const newData = await fetchAttendanceData(date);
      let changed = false;

      newData.forEach((newRec: AttendanceRecord) => {
        const localRec = store.getRecord(newRec.agentId);
        if (!localRec) return;

        // Skip if there are unsaved local changes or the user is currently editing the row
        if (store.dirtyAgents.has(newRec.agentId) || dom.isRowBeingEdited(newRec.agentId)) {
          return;
        }

        // Compare relevant fields to see if something changed remotely
        const fieldsToCompare: (keyof AttendanceRecord)[] = [
          "asistencia",
          "ausencia",
          "entradaReal",
          "cumplimiento",
          "cumplimientoForzado",
          "motivoLoguin",
          "detalle"
        ];

        let hasDiff = false;
        for (const f of fieldsToCompare) {
          if (newRec[f] !== localRec[f]) {
            hasDiff = true;
            break;
          }
        }

        if (hasDiff) {
          dom.updateRow(newRec.agentId, newRec);
          changed = true;
        }
      });

      // Update the store's canonical data
      store.updateCanonicalData(newData);

      if (changed) {
        dom.showSyncStatus("synced");
      }
    } catch (err) {
      console.error("Sync error:", err);
    }
  }, intervalMs);
}

export function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
