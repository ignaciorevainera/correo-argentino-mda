import { calculateCompliance } from "./utils";

export interface AttendanceRecord {
  agentId: number;
  rowId: string;
  shiftType: string;
  date: string;
  nombre: string;
  username: string;
  location: string;
  horarioEstipulado: string;
  modalidadPlanificada: string;
  asistenciaId: number | null;
  asistencia: string;
  ausencia: string;
  entradaReal: string;
  cumplimiento: string;
  cumplimientoForzado: boolean;
  motivoLoguin: string;
  detalle: string;
}

class AttendanceStore {
  private data: AttendanceRecord[] = [];
  public dirtyKeys = new Set<string>();
  private localEdits = new Map<string, Partial<AttendanceRecord>>();

  public init(initialData: AttendanceRecord[]) {
    this.data = JSON.parse(JSON.stringify(initialData));
    this.dirtyKeys.clear();
    this.localEdits.clear();
  }

  public getData(): AttendanceRecord[] {
    // Return data merged with local edits
    return this.data.map(record => {
      const edit = this.localEdits.get(record.rowId);
      if (edit) {
        return { ...record, ...edit } as AttendanceRecord;
      }
      return record;
    });
  }

  public getRecord(rowId: string): AttendanceRecord | undefined {
    const base = this.data.find(r => r.rowId === rowId);
    if (!base) return undefined;
    const edit = this.localEdits.get(rowId);
    if (edit) {
      return { ...base, ...edit } as AttendanceRecord;
    }
    return base;
  }

  public updateField(rowId: string, field: keyof AttendanceRecord, value: any) {
    const record = this.data.find(r => r.rowId === rowId);
    if (!record) return null;

    let edit = this.localEdits.get(rowId);
    if (!edit) {
      edit = {};
      this.localEdits.set(rowId, edit);
    }

    (edit as any)[field] = value;

    // Recalculate compliance if needed
    if (field === "entradaReal" || field === "cumplimiento") {
      const curEntrada = edit.entradaReal !== undefined ? edit.entradaReal : record.entradaReal;
      if (field === "cumplimiento") {
        if (value === "") {
          edit.cumplimientoForzado = false;
          edit.cumplimiento = calculateCompliance(curEntrada, record.horarioEstipulado);
        } else {
          edit.cumplimientoForzado = true;
          edit.cumplimiento = value;
        }
      } else {
        const curForced = edit.cumplimientoForzado !== undefined ? edit.cumplimientoForzado : record.cumplimientoForzado;
        if (!curForced) {
          edit.cumplimiento = calculateCompliance(curEntrada, record.horarioEstipulado);
        }
      }
    }

    // Check if the current merged state actually differs from the canonical record
    const merged = { ...record, ...edit };
    let hasChanged = false;
    const fieldsToCheck: (keyof AttendanceRecord)[] = [
      "asistencia",
      "ausencia",
      "entradaReal",
      "cumplimiento",
      "cumplimientoForzado",
      "motivoLoguin",
      "detalle"
    ];

    for (const f of fieldsToCheck) {
      if (merged[f] !== record[f]) {
        hasChanged = true;
        break;
      }
    }

    if (hasChanged) {
      this.dirtyKeys.add(rowId);
    } else {
      this.dirtyKeys.delete(rowId);
      this.localEdits.delete(rowId);
    }

    return this.getRecord(rowId);
  }

  public getDirtyRecords(): Partial<AttendanceRecord>[] {
    const records: Partial<AttendanceRecord>[] = [];
    this.dirtyKeys.forEach(rowId => {
      const edit = this.localEdits.get(rowId);
      if (edit) {
        const record = this.data.find(r => r.rowId === rowId);
        records.push({
          agentId: record ? record.agentId : parseInt(rowId.split('_')[0]),
          shiftType: record ? record.shiftType : rowId.split('_')[1],
          rowId,
          ...edit
        });
      }
    });
    return records;
  }

  public markClean(rowIds: string[]) {
    rowIds.forEach(id => {
      this.dirtyKeys.delete(id);
      const edit = this.localEdits.get(id);
      if (edit) {
        // Merge the edits into the canonical data
        const idx = this.data.findIndex(r => r.rowId === id);
        if (idx !== -1) {
          this.data[idx] = { ...this.data[idx], ...edit } as AttendanceRecord;
        }
        this.localEdits.delete(id);
      }
    });
  }

  public updateCanonicalData(newData: AttendanceRecord[]) {
    // Update canonical data while keeping local edits that are still dirty
    this.data = newData.map(newRec => {
      const existing = this.data.find(r => r.rowId === newRec.rowId);
      if (existing) {
        // If there's an active local edit, keep it, but update the underlying canonical record
        return newRec;
      }
      return newRec;
    });
  }
}

export const store = new AttendanceStore();
