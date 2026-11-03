import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAttendanceExcelSheet,
  generateAttendanceExcelBuffer,
  timeStringToExcelFraction,
  getAusenciaStyle,
  ATTENDANCE_XLSX_COLUMNS,
} from "./attendanceExport";
import { XLSX_STYLE_INDEX } from "./xlsx";

describe("attendanceExport", () => {
  it("converts time string hh:mm to day fraction correctly", () => {
    assert.equal(timeStringToExcelFraction("00:00"), 0);
    assert.equal(timeStringToExcelFraction("06:00"), 0.25);
    assert.equal(timeStringToExcelFraction("12:00"), 0.5);
    assert.equal(timeStringToExcelFraction("18:00"), 0.75);
    assert.equal(timeStringToExcelFraction(""), null);
    assert.equal(timeStringToExcelFraction("--:--"), null);
    assert.equal(timeStringToExcelFraction("Franco"), null);
  });

  it("builds the exact 9 columns with expected titles", () => {
    const expectedHeaders = [
      "Operador",
      "Sede",
      "Asistencia Real",
      "Ausencia/Eventualidad",
      "Horario Estipulado",
      "Entrada Real",
      "Cumplimiento",
      "Motivo Login",
      "Detalle/Comentario",
    ];

    assert.equal(ATTENDANCE_XLSX_COLUMNS.length, 9);
    assert.deepEqual(
      ATTENDANCE_XLSX_COLUMNS.map((c) => c.title),
      expectedHeaders,
    );
  });

  it("maps each eventuality to its assigned style color", () => {
    assert.equal(getAusenciaStyle("Tramite"), XLSX_STYLE_INDEX.AUSENCIA_TRAMITE);
    assert.equal(getAusenciaStyle("Demorado"), XLSX_STYLE_INDEX.AUSENCIA_DEMORADO);
    assert.equal(getAusenciaStyle("Se reporta enfermo"), XLSX_STYLE_INDEX.AUSENCIA_ENFERMO);
    assert.equal(getAusenciaStyle("Ausente Justificado"), XLSX_STYLE_INDEX.AUSENCIA_JUSTIFICADO);
    assert.equal(getAusenciaStyle("Ausente con Permiso"), XLSX_STYLE_INDEX.AUSENCIA_PERMISO);
    assert.equal(getAusenciaStyle("Ausente No Justificado"), XLSX_STYLE_INDEX.AUSENCIA_NO_JUSTIFICADO);
    assert.equal(getAusenciaStyle("Ausencia sin aviso"), XLSX_STYLE_INDEX.AUSENCIA_SIN_AVISO);
    assert.equal(getAusenciaStyle("Lic. Estudio"), XLSX_STYLE_INDEX.AUSENCIA_ESTUDIO);
    assert.equal(getAusenciaStyle("Lic. Medica"), XLSX_STYLE_INDEX.AUSENCIA_MEDICA);
    assert.equal(getAusenciaStyle("Lic. Anual"), XLSX_STYLE_INDEX.AUSENCIA_ANUAL);
    assert.equal(getAusenciaStyle("Lic. UI"), XLSX_STYLE_INDEX.AUSENCIA_UI);
    assert.equal(getAusenciaStyle("Lic. Gremial"), XLSX_STYLE_INDEX.AUSENCIA_GREMIAL);
    assert.equal(getAusenciaStyle("Lic. Paternidad"), XLSX_STYLE_INDEX.AUSENCIA_PATERNIDAD);
    assert.equal(getAusenciaStyle("Lic. Maternidad"), XLSX_STYLE_INDEX.AUSENCIA_MATERNIDAD);
    assert.equal(getAusenciaStyle("Lic. Fallecimiento"), XLSX_STYLE_INDEX.AUSENCIA_FALLECIMIENTO);
    assert.equal(getAusenciaStyle("ART"), XLSX_STYLE_INDEX.AUSENCIA_ART);
  });

  it("builds sheet definition with rawRows matching sample structure and exactly 9 columns", () => {
    const mockRecords: any[] = [
      {
        agentId: 1,
        rowId: "1_normal",
        shiftType: "normal",
        date: "2026-11-03",
        nombre: "Rodriguez David",
        username: "drodriguez",
        location: "Parque Patricios",
        asistencia: "HOME OFFICE",
        ausencia: "Se reporta enfermo",
        horarioEstipulado: "06:00 - 15:00",
        entradaReal: "--:--",
        cumplimiento: "Sin Registro",
        motivoLoguin: "Se reporta enfermo",
        detalle: "5:30hs  Reporta malestar (fiebre)",
      },
      {
        agentId: 2,
        rowId: "2_normal",
        shiftType: "normal",
        date: "2026-11-03",
        nombre: "Aguirre Agustín",
        username: "aaguirre",
        location: "Monte Grande",
        asistencia: "PRESENCIAL MONTE GRANDE",
        ausencia: "",
        horarioEstipulado: "08:00 - 17:00",
        entradaReal: "08:05",
        cumplimiento: "Cumplió",
        motivoLoguin: "",
        detalle: "",
      },
    ];

    const sheetDef = buildAttendanceExcelSheet(mockRecords);
    assert.equal(sheetDef.name, "Hoja1");
    // Only 9 main columns (A through I)
    assert.equal(sheetDef.colWidths?.length, 9);
    assert.equal(sheetDef.rawRows!.length, 3);

    // Header row
    const headerRow = sheetDef.rawRows![0];
    assert.equal(headerRow.rowNum, 1);
    assert.equal(headerRow.cells.length, 9);
    assert.equal(headerRow.cells[0].value, "Operador");
    assert.equal(headerRow.cells[8].value, "Detalle/Comentario");

    // Row 2 data
    const row2 = sheetDef.rawRows![1];
    assert.equal(row2.rowNum, 2);
    assert.equal(row2.cells.length, 9);
    assert.equal(row2.cells[0].value, "Rodriguez David");
    assert.equal(row2.cells[0].styleId, XLSX_STYLE_INDEX.ASIST_SEDE_PP);
    assert.equal(row2.cells[1].value, "Parque Patricios");
    assert.equal(row2.cells[1].styleId, XLSX_STYLE_INDEX.ASIST_SEDE_PP);
    assert.equal(row2.cells[2].value, "HOME OFFICE");
    assert.equal(row2.cells[2].styleId, XLSX_STYLE_INDEX.ASIST_HO);
    assert.equal(row2.cells[3].value, "Se reporta enfermo");
    assert.equal(row2.cells[3].styleId, XLSX_STYLE_INDEX.AUSENCIA_ENFERMO);
    assert.equal(row2.cells[4].value, "06:00 - 15:00");
    assert.equal(row2.cells[5].value, "--:--");
    assert.equal(row2.cells[6].value, "Sin Registro");

    // Row 3 data (time as fraction)
    const row3 = sheetDef.rawRows![2];
    assert.equal(row3.rowNum, 3);
    assert.equal(row3.cells.length, 9);
    assert.equal(row3.cells[0].value, "Aguirre Agustín");
    assert.equal(row3.cells[0].styleId, XLSX_STYLE_INDEX.ASIST_SEDE_MG);
    assert.equal(typeof row3.cells[5].value, "number");
  });

  it("generates a valid ZIP/XLSX buffer with PK signature", () => {
    const buf = generateAttendanceExcelBuffer([]);
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 0);
    // PK zip signature 0x50 0x4B 0x03 0x04
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
    assert.equal(buf[2], 0x03);
    assert.equal(buf[3], 0x04);
  });
});
