import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMultiChannelAuditScores,
  QUALITY_APPROVAL_THRESHOLD,
} from "../qualityCalculator";
import {
  buildOperatorFullEvaluationSheet,
  getTicketModeLabel,
  escapeCsvCell,
} from "../qualityExport";
import {
  WISE_CALL_PARAMETERS,
  WISE_EMAIL_PARAMETERS,
  INVGATE_AG_PARAMETERS,
} from "../../config/qualityParams";

describe("qualityExportParity — Oráculo independiente y paridad de scoring (#339)", () => {
  it("QUALITY_APPROVAL_THRESHOLD debe ser 75 como umbral de aprobación de reportes", () => {
    assert.equal(QUALITY_APPROVAL_THRESHOLD, 75);
  });

  describe("Oráculo Independiente (Valores Numéricos Hardcodeados)", () => {
    it("Wise Call con ticket: cumplimiento parcial (falla cordialidad 3% y sondeo 6%) -> 91% APROBADO", () => {
      // Base S1 = 45. Deducciones: cordialidad (3) + sondeo (6) = 9. S1 = 36.
      // S2 = 55 (100%). Total = 36 + 55 = 91.
      const compliantCodes = new Set(
        WISE_CALL_PARAMETERS.filter((p) => p.code !== "call_cordialidad" && p.code !== "call_sondeo").map((p) => p.code),
      );

      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_call",
          date: "2026-10-01",
          callId: "1001",
          ticketId: "#1001",
          appliesMda: true,
          totalScore: undefined, // Evalúa el cálculo de fallback del export
          scores: Array.from(compliantCodes).map((code) => ({ parameterCode: code, score: true })),
        },
      ]);

      const r15 = sheet.rawRows.find((r) => r.rowNum === 15);
      assert.ok(r15);
      const totalCell = r15.cells.find((c) => c.colIdx === 12)?.value;
      const statusCell = r15.cells.find((c) => c.colIdx === 13)?.value;

      // Oráculo independiente: 0.91 exacto y APROBADO
      assert.equal(totalCell, 0.91);
      assert.equal(statusCell, "APROBADO");
    });

    it("Wise Call sin ticket (appliesMda=false): cumplimiento parcial (falla procedimiento 10%) -> 78% APROBADO", () => {
      // Base S1 = 45. Falla procedimiento (10) -> s1Raw = 35.
      // Normalización sin S2: Math.round((35 / 45) * 100) = 78%.
      const s1Params = WISE_CALL_PARAMETERS.filter((p) => p.section === "items" && p.code !== "call_procedimiento");

      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_call",
          date: "2026-10-01",
          callId: "1002",
          ticketId: null,
          appliesMda: false,
          totalScore: undefined,
          scores: s1Params.map((p) => ({ parameterCode: p.code, score: true })),
        },
      ]);

      const r15 = sheet.rawRows.find((r) => r.rowNum === 15);
      assert.ok(r15);
      const totalCell = r15.cells.find((c) => c.colIdx === 12)?.value;
      const statusCell = r15.cells.find((c) => c.colIdx === 13)?.value;

      // Oráculo independiente: 0.78 exacto y APROBADO (>= 75)
      assert.equal(totalCell, 0.78);
      assert.equal(statusCell, "APROBADO");
    });

    it("Wise Call reprobada: múltiples desvíos en S1 y S2 -> 52% REPROBADO", () => {
      // Falla procedimiento (10), sondeo (6), control (3) en S1 -> s1Raw = 45 - 19 = 26
      // Falla ortografía (8), categorización (10), tipo (5), origen (6) en S2 -> s2Raw = 55 - 29 = 26
      // Total = 26 + 26 = 52.
      const failedCodes = new Set([
        "call_procedimiento", "call_sondeo", "call_control_conversacion",
        "call_ticket_ortografia", "call_ticket_categorizacion", "call_ticket_tipo", "call_ticket_origen",
      ]);
      const compliantParams = WISE_CALL_PARAMETERS.filter((p) => !failedCodes.has(p.code));

      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_call",
          date: "2026-10-01",
          callId: "1003",
          ticketId: "#1003",
          appliesMda: true,
          totalScore: undefined,
          scores: compliantParams.map((p) => ({ parameterCode: p.code, score: true })),
        },
      ]);

      const r15 = sheet.rawRows.find((r) => r.rowNum === 15);
      assert.ok(r15);
      const totalCell = r15.cells.find((c) => c.colIdx === 12)?.value;
      const statusCell = r15.cells.find((c) => c.colIdx === 13)?.value;

      // Oráculo independiente: 0.52 y REPROBADO (< 75)
      assert.equal(totalCell, 0.52);
      assert.equal(statusCell, "REPROBADO");
    });

    it("Wise Email con ticket: cumplimiento parcial (falla interpretación 10%) -> 95% APROBADO", () => {
      // S1 = 100 - 10 = 90. S2 = 100. Total = Math.round((90 + 100) / 2) = 95.
      const compliantParams = WISE_EMAIL_PARAMETERS.filter((p) => p.code !== "email_interpretacion");

      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_email",
          date: "2026-10-01",
          callId: "2001",
          ticketId: "#2001",
          appliesMda: true,
          totalScore: undefined,
          scores: compliantParams.map((p) => ({ parameterCode: p.code, score: true })),
        },
      ]);

      const r14 = sheet.rawRows.find((r) => r.rowNum === 14);
      assert.ok(r14);
      const totalCell = r14.cells.find((c) => c.colIdx === 27)?.value;
      const statusCell = r14.cells.find((c) => c.colIdx === 28)?.value;

      assert.equal(totalCell, 0.95);
      assert.equal(statusCell, "APROBADO");
    });

    it("Wise Email reprobado: desvíos acumulados en S1 y S2 -> 50% REPROBADO", () => {
      // S1: falla interpretación (10) + procedimientos (10) + redacción (10) + sla_90min (20) = 50 ded -> S1 = 50.
      // S2: falla sla_resolucion (10) + seguimiento (10) + categorizacion_final (10) + ortografia (10) + categorizacion (10) = 50 ded -> S2 = 50.
      // Total = Math.round((50 + 50) / 2) = 50.
      const failed = new Set([
        "email_interpretacion", "email_procedimientos", "email_redaccion", "email_sla_90min",
        "email_mda_sla_resolucion", "email_mda_seguimiento", "email_mda_categorizacion_final", "email_mda_ortografia", "email_mda_categorizacion",
      ]);
      const compliantParams = WISE_EMAIL_PARAMETERS.filter((p) => !failed.has(p.code));

      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_email",
          date: "2026-10-01",
          callId: "2002",
          ticketId: "#2002",
          appliesMda: true,
          totalScore: undefined,
          scores: compliantParams.map((p) => ({ parameterCode: p.code, score: true })),
        },
      ]);

      const r14 = sheet.rawRows.find((r) => r.rowNum === 14);
      assert.ok(r14);
      const totalCell = r14.cells.find((c) => c.colIdx === 27)?.value;
      const statusCell = r14.cells.find((c) => c.colIdx === 28)?.value;

      assert.equal(totalCell, 0.5);
      assert.equal(statusCell, "REPROBADO");
    });

    it("Autogestión (invgate_ticket): cumplimiento parcial (falla ag_titulo 10%) -> 95% APROBADO", () => {
      // S1: falla ag_titulo (10) -> 90. S2 = 100. Total = Math.round((90 + 100) / 2) = 95.
      const compliantParams = INVGATE_AG_PARAMETERS.filter((p) => p.code !== "ag_titulo");

      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "invgate_ticket",
          date: "2026-10-01",
          ticketId: "#3001",
          staysInMda: true,
          totalScore: undefined,
          scores: compliantParams.map((p) => ({ parameterCode: p.code, score: true })),
        },
      ]);

      const r14 = sheet.rawRows.find((r) => r.rowNum === 14);
      assert.ok(r14);
      const totalCell = r14.cells.find((c) => c.colIdx === 42)?.value;
      const statusCell = r14.cells.find((c) => c.colIdx === 43)?.value;

      assert.equal(totalCell, 0.95);
      assert.equal(statusCell, "APROBADO");
    });
  });

  describe("Paridad entre Fallback del Export y Motor Canónico de Cálculo (calculateMultiChannelAuditScores)", () => {
    it("El fallback dinámico del export produce el mismo resultado que el cálculo canónico de persistencia", () => {
      // Simular auditoría real guardada con scores parciales
      const failedCodes = new Set(["call_cordialidad", "call_ticket_ortografia"]);
      const compliantCodes = new Set(WISE_CALL_PARAMETERS.filter((p) => !failedCodes.has(p.code)).map((p) => p.code));

      // 1. Lo que calcula el action al guardar (src/actions/index.ts:380)
      const { totalScore: persistedScore } = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        compliantCodes,
        true,
        false,
      );

      // 2. Export con auditoría que tiene el totalScore persistido de DB
      const sheetPersisted = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_call",
          date: "2026-10-01",
          callId: "5001",
          ticketId: "#5001",
          appliesMda: true,
          totalScore: persistedScore,
          scores: Array.from(compliantCodes).map((code) => ({ parameterCode: code, score: true })),
        },
      ]);

      // 3. Export con auditoría donde totalScore es undefined (fallback dinámico)
      const sheetFallback = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_call",
          date: "2026-10-01",
          callId: "5001",
          ticketId: "#5001",
          appliesMda: true,
          totalScore: undefined,
          scores: Array.from(compliantCodes).map((code) => ({ parameterCode: code, score: true })),
        },
      ]);

      const cellPersisted = sheetPersisted.rawRows.find((r) => r.rowNum === 15)!.cells.find((c) => c.colIdx === 12)!.value;
      const cellFallback = sheetFallback.rawRows.find((r) => r.rowNum === 15)!.cells.find((c) => c.colIdx === 12)!.value;

      // Ambos deben ser exactamente idénticos al persistedScore / 100
      assert.equal(cellPersisted, persistedScore / 100);
      assert.equal(cellFallback, persistedScore / 100);
      assert.equal(cellPersisted, cellFallback);
    });
  });

  describe("Invariantes de Formato y Delimitadores (#339)", () => {
    it("Las notas confidenciales del supervisor jamás se filtran a la celda ticketId", () => {
      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "wise_call",
          date: "2026-10-01",
          callId: "1001",
          ticketId: null,
          notes: "Nota confidencial del supervisor",
          appliesMda: false,
          totalScore: 100,
          scores: [],
        },
      ]);

      const allValues = sheet.rawRows.flatMap((r) => r.cells.map((c) => c.value));
      assert.ok(!allValues.includes("Nota confidencial del supervisor"));
      assert.ok(allValues.includes("Sin ticket"));
    });

    it("La prioridad de AG usa el valor real persistido o '-' si es nula, nunca 'Baja' hardcodeada", () => {
      const sheet = buildOperatorFullEvaluationSheet("Operador Test", [
        {
          id: 1,
          channelType: "invgate_ticket",
          date: "2026-10-01",
          ticketId: "#3001",
          priority: "Urgente",
          totalScore: 90,
          scores: [],
        },
        {
          id: 2,
          channelType: "invgate_ticket",
          date: "2026-10-02",
          ticketId: "#3002",
          priority: undefined,
          totalScore: 90,
          scores: [],
        },
      ]);

      const r2 = sheet.rawRows.find((r) => r.rowNum === 2);
      assert.ok(r2);
      assert.equal(r2.cells.find((c) => c.colIdx === 32)?.value, "Urgente");

      const r17 = sheet.rawRows.find((r) => r.rowNum === 17);
      assert.ok(r17);
      assert.equal(r17.cells.find((c) => c.colIdx === 32)?.value, "-");
    });

    it("getTicketModeLabel devuelve las etiquetas institucionales requeridas", () => {
      assert.equal(getTicketModeLabel({ isReclamoNovedad: true }), "Reclamo / Novedad (100%)");
      assert.equal(getTicketModeLabel({ channelType: "wise_call", appliesMda: false }), "Sin Ticket");
      assert.equal(getTicketModeLabel({ channelType: "wise_email", appliesMda: false }), "Sin Ticket MDA");
      assert.equal(getTicketModeLabel({ channelType: "invgate_ticket", staysInMda: false }), "Derivado fuera de MDA");
      assert.equal(getTicketModeLabel({ channelType: "wise_call", appliesMda: true }), "Ticket Nuevo");
    });

    it("escapeCsvCell escapa correctamente caracteres especiales", () => {
      assert.equal(escapeCsvCell(null), "");
      assert.equal(escapeCsvCell(undefined), "");
      assert.equal(escapeCsvCell("Simple"), "Simple");
      assert.equal(escapeCsvCell("A;B"), '"A;B"');
      assert.equal(escapeCsvCell('Con "comillas"'), '"Con ""comillas"""');
      assert.equal(escapeCsvCell("Salto\nde linea"), '"Salto\nde linea"');
    });
  });
});
