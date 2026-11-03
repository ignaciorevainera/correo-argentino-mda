import {
  generateMultiSheetXlsxBuffer,
  type XlsxSheetDefinition,
  type XlsxColWidth,
  type XlsxCellData,
  XLSX_STYLE_INDEX,
} from "./xlsx";
import type { getAttendanceData } from "./attendance";

export type AttendanceItem = Awaited<ReturnType<typeof getAttendanceData>>[number];

export const ATTENDANCE_XLSX_COLUMNS: {
  key: string;
  title: string;
  width: number;
}[] = [
  { key: "nombre", title: "Operador", width: 22.42578125 },
  { key: "location", title: "Sede", width: 15.42578125 },
  { key: "asistencia", title: "Asistencia Real", width: 27.7109375 },
  { key: "ausencia", title: "Ausencia/Eventualidad", width: 21.5703125 },
  { key: "horarioEstipulado", title: "Horario Estipulado", width: 17.5703125 },
  { key: "entradaReal", title: "Entrada Real", width: 14.0 },
  { key: "cumplimiento", title: "Cumplimiento", width: 13.5703125 },
  { key: "motivoLoguin", title: "Motivo Login", width: 18.5703125 },
  { key: "detalle", title: "Detalle/Comentario", width: 59.7109375 },
];

// Eventuality label to styleId mapping based on Portal MDA - Asistencia.xlsx
export const AUSENCIA_STYLE_MAP: Record<string, number> = {
  "tramite": XLSX_STYLE_INDEX.AUSENCIA_TRAMITE,
  "trámite": XLSX_STYLE_INDEX.AUSENCIA_TRAMITE,
  "demorado": XLSX_STYLE_INDEX.AUSENCIA_DEMORADO,
  "demorada": XLSX_STYLE_INDEX.AUSENCIA_DEMORADO,
  "se reporta enfermo": XLSX_STYLE_INDEX.AUSENCIA_ENFERMO,
  "enfermo": XLSX_STYLE_INDEX.AUSENCIA_ENFERMO,
  "ausente justificado": XLSX_STYLE_INDEX.AUSENCIA_JUSTIFICADO,
  "ausente con permiso": XLSX_STYLE_INDEX.AUSENCIA_PERMISO,
  "ausente no justificado": XLSX_STYLE_INDEX.AUSENCIA_NO_JUSTIFICADO,
  "ausencia sin aviso": XLSX_STYLE_INDEX.AUSENCIA_SIN_AVISO,
  "lic. estudio": XLSX_STYLE_INDEX.AUSENCIA_ESTUDIO,
  "lic. medica": XLSX_STYLE_INDEX.AUSENCIA_MEDICA,
  "lic. médica": XLSX_STYLE_INDEX.AUSENCIA_MEDICA,
  "lic. anual": XLSX_STYLE_INDEX.AUSENCIA_ANUAL,
  "lic. ui": XLSX_STYLE_INDEX.AUSENCIA_UI,
  "lic. gremial": XLSX_STYLE_INDEX.AUSENCIA_GREMIAL,
  "lic. paternidad": XLSX_STYLE_INDEX.AUSENCIA_PATERNIDAD,
  "lic. maternidad": XLSX_STYLE_INDEX.AUSENCIA_MATERNIDAD,
  "lic. fallecimiento": XLSX_STYLE_INDEX.AUSENCIA_FALLECIMIENTO,
  "art": XLSX_STYLE_INDEX.AUSENCIA_ART,
};

/**
 * Converts a time string (e.g. "08:05" or "08:05:00") into an Excel time fraction (0.0 to 1.0).
 * Returns null if the value is missing, empty, "--:--" or not a parseable time.
 */
export function timeStringToExcelFraction(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (clean === "" || clean === "--:--" || clean.toLowerCase() === "franco") {
    return null;
  }
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return totalSeconds / 86400;
}

export function getAusenciaStyle(ausenciaText: string | null | undefined): number {
  if (!ausenciaText) return XLSX_STYLE_INDEX.DATA_TEXT;
  const clean = ausenciaText.trim().toLowerCase();
  if (AUSENCIA_STYLE_MAP[clean]) {
    return AUSENCIA_STYLE_MAP[clean];
  }
  // Fallbacks for partial matches
  if (clean.includes("enfermo") || clean.includes("médic") || clean.includes("medic")) {
    return XLSX_STYLE_INDEX.AUSENCIA_MEDICA;
  }
  if (clean.includes("demorad")) {
    return XLSX_STYLE_INDEX.AUSENCIA_DEMORADO;
  }
  if (clean.includes("gremial")) {
    return XLSX_STYLE_INDEX.AUSENCIA_GREMIAL;
  }
  if (clean.includes("anual")) {
    return XLSX_STYLE_INDEX.AUSENCIA_ANUAL;
  }
  if (clean.includes("estudio")) {
    return XLSX_STYLE_INDEX.AUSENCIA_ESTUDIO;
  }
  if (clean.includes("art")) {
    return XLSX_STYLE_INDEX.AUSENCIA_ART;
  }
  return XLSX_STYLE_INDEX.DATA_CENTER;
}

export function buildAttendanceExcelSheet(records: AttendanceItem[]): XlsxSheetDefinition {
  const colWidths: XlsxColWidth[] = ATTENDANCE_XLSX_COLUMNS.map((col, idx) => ({
    colIdx: idx,
    width: col.width,
  }));

  const totalRowsCount = records.length + 1;
  const rawRows: { rowNum: number; cells: XlsxCellData[] }[] = [];

  for (let r = 1; r <= totalRowsCount; r++) {
    const cells: XlsxCellData[] = [];

    if (r === 1) {
      // 1. Header row
      ATTENDANCE_XLSX_COLUMNS.forEach((col, idx) => {
        cells.push({
          colIdx: idx,
          value: col.title,
          styleId: idx === 5 ? XLSX_STYLE_INDEX.HEADER_CENTER : XLSX_STYLE_INDEX.ASIST_HEADER,
        });
      });
    } else {
      // 2. Data rows
      const recIdx = r - 2;
      const rec = records[recIdx];

      if (rec) {
        // Determine sede style (Parque Patricios = soft purple #E9D3F0, Monte Grande = light yellow #FFFF00)
        const locLower = (rec.location || "").toLowerCase().trim();
        let sedeStyle = XLSX_STYLE_INDEX.DATA_TEXT;
        if (locLower.includes("parque patricios") || locLower.includes("patricios")) {
          sedeStyle = XLSX_STYLE_INDEX.ASIST_SEDE_PP;
        } else if (locLower.includes("monte grande")) {
          sedeStyle = XLSX_STYLE_INDEX.ASIST_SEDE_MG;
        }

        // Col 0: Operador (takes sede color)
        cells.push({
          colIdx: 0,
          value: rec.nombre || "",
          styleId: sedeStyle,
        });

        // Col 1: Sede (takes sede color)
        cells.push({
          colIdx: 1,
          value: rec.location || "",
          styleId: sedeStyle,
        });

        // Col 2: Asistencia Real (HOME OFFICE = Soft blue, PRESENCIAL = Light yellow / Soft pink)
        let asistenciaStyle: number = XLSX_STYLE_INDEX.DATA_CENTER;
        const asisUpper = (rec.asistencia || "").toUpperCase().trim();
        if (asisUpper.includes("HOME OFFICE")) {
          asistenciaStyle = XLSX_STYLE_INDEX.ASIST_HO;
        } else if (asisUpper.includes("MONTE GRANDE")) {
          asistenciaStyle = XLSX_STYLE_INDEX.ASIST_PRESENCIAL_MG;
        } else if (asisUpper.includes("PARQUE PATRICIOS")) {
          asistenciaStyle = XLSX_STYLE_INDEX.ASIST_PRESENCIAL_PP;
        } else if (asisUpper.includes("PRESENCIAL")) {
          asistenciaStyle = XLSX_STYLE_INDEX.ASIST_PRESENCIAL_MG;
        }
        cells.push({
          colIdx: 2,
          value: rec.asistencia || "",
          styleId: asistenciaStyle,
        });

        // Col 3: Ausencia/Eventualidad (styled with exact eventuality color palette)
        const ausencia = (rec.ausencia || "").trim();
        const ausenciaStyle = getAusenciaStyle(ausencia);
        cells.push({
          colIdx: 3,
          value: ausencia,
          styleId: ausenciaStyle,
        });

        // Col 4: Horario Estipulado (Centered)
        cells.push({
          colIdx: 4,
          value: rec.horarioEstipulado || "Franco",
          styleId: XLSX_STYLE_INDEX.DATA_CENTER,
        });

        // Col 5: Entrada Real (Time formatted hh:mm or Centered text)
        const timeFraction = timeStringToExcelFraction(rec.entradaReal);
        if (timeFraction !== null) {
          cells.push({
            colIdx: 5,
            value: timeFraction,
            styleId: XLSX_STYLE_INDEX.ASIST_TIME,
          });
        } else {
          cells.push({
            colIdx: 5,
            value: rec.entradaReal || "--:--",
            styleId: XLSX_STYLE_INDEX.DATA_CENTER,
          });
        }

        // Col 6: Cumplimiento
        cells.push({
          colIdx: 6,
          value: rec.cumplimiento || "",
          styleId: XLSX_STYLE_INDEX.DATA_TEXT,
        });

        // Col 7: Motivo Login
        cells.push({
          colIdx: 7,
          value: rec.motivoLoguin || "",
          styleId: XLSX_STYLE_INDEX.DATA_TEXT,
        });

        // Col 8: Detalle/Comentario
        cells.push({
          colIdx: 8,
          value: rec.detalle || "",
          styleId: XLSX_STYLE_INDEX.DATA_TEXT,
        });
      }
    }

    rawRows.push({ rowNum: r, cells });
  }

  return {
    name: "Hoja1",
    colWidths,
    rawRows,
  };
}

export function generateAttendanceExcelBuffer(records: AttendanceItem[]): Buffer {
  const sheet = buildAttendanceExcelSheet(records);
  return generateMultiSheetXlsxBuffer([sheet]);
}
