import { calculateCompliance } from "./utils";

export interface AttendanceRecord {
  agentId: number;
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
  public dirtyAgents = new Set<number>();
  private localEdits = new Map<number, Partial<AttendanceRecord>>();

  public init(initialData: AttendanceRecord[]) {
    this.data = JSON.parse(JSON.stringify(initialData));
    this.dirtyAgents.clear();
    this.localEdits.clear();
  }

  public getData(): AttendanceRecord[] {
    // Return data merged with local edits
    return this.data.map(record => {
      const edit = this.localEdits.get(record.agentId);
      if (edit) {
        return { ...record, ...edit } as AttendanceRecord;
      }
      return record;
    });
  }

  public getRecord(agentId: number): AttendanceRecord | undefined {
    const base = this.data.find(r => r.agentId === agentId);
    if (!base) return undefined;
    const edit = this.localEdits.get(agentId);
    if (edit) {
      return { ...base, ...edit } as AttendanceRecord;
    }
    return base;
  }

  public updateField(agentId: number, field: keyof AttendanceRecord, value: any) {
    const record = this.data.find(r => r.agentId === agentId);
    if (!record) return null;

    let edit = this.localEdits.get(agentId);
    if (!edit) {
      edit = {};
      this.localEdits.set(agentId, edit);
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
      this.dirtyAgents.add(agentId);
    } else {
      this.dirtyAgents.delete(agentId);
      this.localEdits.delete(agentId);
    }

    return this.getRecord(agentId);
  }

  public getDirtyRecords(): Partial<AttendanceRecord>[] {
    const records: Partial<AttendanceRecord>[] = [];
    this.dirtyAgents.forEach(agentId => {
      const edit = this.localEdits.get(agentId);
      if (edit) {
        records.push({
          agentId,
          ...edit
        });
      }
    });
    return records;
  }

  public markClean(agentIds: number[]) {
    agentIds.forEach(id => {
      this.dirtyAgents.delete(id);
      const edit = this.localEdits.get(id);
      if (edit) {
        // Merge the edits into the canonical data
        const idx = this.data.findIndex(r => r.agentId === id);
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
      const existing = this.data.find(r => r.agentId === newRec.agentId);
      if (existing) {
        // If there's an active local edit, keep it, but update the underlying canonical record
        return newRec;
      }
      return newRec;
    });
  }
}

export const store = new AttendanceStore();
