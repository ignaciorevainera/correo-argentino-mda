import { store } from "./store";
import { dom } from "./dom";

let saveTimeout: any = null;

export async function fetchAttendanceData(date: string) {
  const cleanBase = import.meta.env.BASE_URL || "/";
  const response = await fetch(`${cleanBase}api/asistencia?date=${date}`);
  if (!response.ok) throw new Error("Failed to fetch attendance data");
  return response.json();
}

export async function saveEdits(date: string, edits: any[]) {
  const cleanBase = import.meta.env.BASE_URL || "/";
  const response = await fetch(`${cleanBase}api/asistencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, edits }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to save edits");
  }
  return true;
}

export function triggerAutoSave(date: string) {
  dom.showSyncStatus("saving");

  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    const edits = store.getDirtyRecords();
    if (edits.length === 0) {
      dom.showSyncStatus("saved");
      return;
    }

    try {
      const rowIds = edits.map(e => e.rowId as string);
      await saveEdits(date, edits);
      store.markClean(rowIds);
      dom.showSyncStatus("saved");
    } catch (err: any) {
      console.error("Auto-save error:", err);
      dom.showSyncStatus("error", err.message || "Error al guardar");
    }
  }, 1000);
}
