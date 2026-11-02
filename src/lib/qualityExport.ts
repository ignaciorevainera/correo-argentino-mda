export const CHANNEL_LABEL_MAP: Record<string, string> = {
  wise_call: "Llamada Wise",
  wise_email: "Mail Wise",
  invgate_ticket: "Autogestión",
};

export function getTicketModeLabel(audit: {
  isReclamoNovedad?: boolean;
  channelType?: string;
  appliesMda?: boolean | null;
  staysInMda?: boolean | null;
}): string {
  if (audit.isReclamoNovedad) {
    return "Reclamo / Novedad (100%)";
  }
  if (audit.channelType === "wise_call" && audit.appliesMda === false) {
    return "Sin Ticket";
  }
  if (audit.channelType === "wise_email" && audit.appliesMda === false) {
    return "Sin Ticket MDA";
  }
  if (audit.channelType === "invgate_ticket" && audit.staysInMda === false) {
    return "Derivado fuera de MDA";
  }
  return "Ticket Nuevo";
}

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const valStr = typeof val === "string" ? val : String(val);
  if (
    valStr.includes(";") ||
    valStr.includes("\n") ||
    valStr.includes("\r") ||
    valStr.includes('"')
  ) {
    return `"${valStr.replace(/"/g, '""')}"`;
  }
  return valStr;
}

export function getAuditExportHeaders(
  params: { code: string; name: string }[],
): string[] {
  const headers = [
    "Periodo",
    "Canal",
    "Operador",
    "Usuario",
    "Fecha",
    "ID Llamada / Caso",
    "ID Ticket / AG",
    "Duración",
    "Tiempo Ringueo",
    "Creación",
    "Toma / Lectura",
    "Es PAS",
    "Modo Ticket",
    "Puntaje Secc. 1 (%)",
    "Puntaje Secc. 2 (%)",
    "Puntaje Total (%)",
  ];

  params.forEach((p) => {
    headers.push(`[${p.code}] ${p.name}`);
  });

  headers.push("Observaciones");
  headers.push("Devolución al Operador");
  return headers;
}
import { XLSX_STYLE_INDEX, type XlsxCellData, type XlsxColWidth } from "./xlsx";
import { getChannelParameters } from "../config/qualityParams";
import { calculateMultiChannelAuditScores, QUALITY_APPROVAL_THRESHOLD } from "./qualityCalculator";

/**
 * Resuelve la celda "Cumple" de un ítem a partir de su score.
 *
 * Un ítem sin score guardado NO es un cumplimiento: en la sección 2 la fila se
 * omite cuando el flag invalida esa sección (llamada sin ticket, mail sin
 * ticket MDA, autogestión derivada fuera de MDA). Marcarlo "CUMPLE" por
 * defecto sería un falso positivo en un archivo que va a supervisión.
 */
function cumpleCell(sc: { score: boolean } | undefined): {
  label: string;
  styleId: number;
  meets: boolean | undefined;
} {
  if (!sc) {
    return { label: "N/A", styleId: XLSX_STYLE_INDEX.DATA_CENTER, meets: undefined };
  }
  return sc.score
    ? { label: "CUMPLE", styleId: XLSX_STYLE_INDEX.CUMPLE_TRUE, meets: true }
    : { label: "NO CUMPLE", styleId: XLSX_STYLE_INDEX.CUMPLE_FALSE, meets: false };
}

export interface QualityAuditExportData {
  id: number;
  sampleIndex?: number;
  channelType: string;
  date?: string | null;
  callId?: string | null;
  ticketId?: string | null;
  priority?: string | null;
  duration?: string | null;
  ringTime?: string | null;
  creationTime?: string | null;
  takeTime?: string | null;
  appliesMda?: boolean | null;
  staysInMda?: boolean | null;
  isPas?: boolean | null;
  isReclamoNovedad?: boolean | null;
  notes?: string | null;
  operatorCoaching?: string | null;
  section1Score?: number | null;
  section2Score?: number | null;
  totalScore?: number | null;
  scores: {
    parameterCode: string;
    score: boolean;
    comment?: string | null;
  }[];
}

export function buildOperatorFullEvaluationSheet(
  operatorName: string,
  audits: QualityAuditExportData[],
): {
  name: string;
  colWidths: XlsxColWidth[];
  rawRows: {
    rowNum: number;
    cells: XlsxCellData[];
  }[];
} {
  const rowMap = new Map<number, Map<number, { val: string | number | boolean | null | undefined; styleId?: number }>>();

  const setCell = (
    row: number,
    col: number,
    val: string | number | boolean | null | undefined,
    styleId: number = XLSX_STYLE_INDEX.DATA_TEXT,
  ) => {
    if (!rowMap.has(row)) {
      rowMap.set(row, new Map());
    }
    rowMap.get(row)!.set(col, { val, styleId });
  };

  // Dynamic templates per channel derived from Single Source of Truth (qualityParams)
  const wiseCallParams = getChannelParameters("wise_call");
  const callS1Items: { name: string; ref: number; code: string }[] = wiseCallParams
    .filter((p) => p.section === "items")
    .map((p) => ({ name: p.name, ref: (p.weight ?? 0) / 100, code: p.code }));

  const callS2Items: { name: string; ref: number; code: string }[] = [
    ...wiseCallParams
      .filter((p) => p.section === "ticket" || p.section === "mda")
      .map((p) => ({ name: p.name, ref: (p.weight ?? 0) / 100, code: p.code })),
    { name: "Reclamo/Novedad", ref: 0.55, code: "call_ticket_reclamo_novedad" },
  ];

  const wiseEmailParams = getChannelParameters("wise_email");
  const emailS1Items: { name: string; ref: number; code: string }[] = wiseEmailParams
    .filter((p) => p.section === "items" && p.code !== "email_solicitud" && p.code !== "email_sla_90min")
    .map((p) => ({ name: p.name, ref: (p.weight ?? 0) / 100, code: p.code }));

  const emailS2Items: { name: string; ref: number; code: string }[] = [
    ...wiseEmailParams
      .filter((p) => p.section === "mda")
      .map((p) => ({ name: p.name, ref: (p.weight ?? 0) / 100, code: p.code })),
    { name: "Reclamo/Novedad", ref: 1, code: "email_mda_reclamo_novedad" },
  ];

  const invgateAgParams = getChannelParameters("invgate_ticket");
  const agS1Items: { name: string; ref: number; code: string }[] = invgateAgParams
    .filter((p) => p.section === "items")
    .map((p) => ({ name: p.name, ref: (p.weight ?? 0) / 100, code: p.code }));

  const agS2Items: { name: string; ref: number; code: string }[] = invgateAgParams
    .filter((p) => p.section === "mda")
    .map((p) => ({ name: p.name, ref: (p.weight ?? 0) / 100, code: p.code }));

  // Group audits by channel
  const callAudits = audits.filter((a) => a.channelType === "wise_call");
  const emailAudits = audits.filter((a) => a.channelType === "wise_email");
  const agAudits = audits.filter((a) => a.channelType === "invgate_ticket");

  const callScores: (number | null)[] = [null, null, null, null];
  const emailScores: (number | null)[] = [null, null, null, null];
  const agScores: (number | null)[] = [null, null, null, null];

  // Render 4 samples (rows 1-15, 16-30, 31-45, 46-60)
  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const callB = sIdx * 16;
    const mailB = sIdx * 15;
    const agB = sIdx * 15;

    // --- ROW 1 OF BLOCK: HEADERS ---
    // Calls Headers
    const cHeadR = callB + 1;
    setCell(cHeadR, 1, "Operador", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 2, "Caso LLamado Wise", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 3, "Tiempo de Ringueo", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 4, "Duración", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 5, "Items", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(cHeadR, 6, "%referencia", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 7, "% evaluatorio", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 8, "Cumple", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 9, "Comentarios", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(cHeadR, 10, "TICKET", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(cHeadR, 11, "%referencia", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 12, "% evaluatorio", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 13, "Cumple", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(cHeadR, 14, "Comentarios", XLSX_STYLE_INDEX.HEADER_LEFT);

    // Email Headers
    const mHeadR = mailB + 1;
    setCell(mHeadR, 16, "Operador", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 17, "Fecha", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 18, "Creación/Toma", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 20, "Items", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(mHeadR, 21, "%referencia", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 22, "% evaluatorio", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 23, "Cumple", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 24, "Comentarios", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(mHeadR, 25, "Items categoría MDA", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(mHeadR, 26, "%referencia", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 27, "% evaluatorio", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 28, "Cumple", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(mHeadR, 29, "Comentarios", XLSX_STYLE_INDEX.HEADER_LEFT);

    // AG Headers
    const agHeadR = agB + 1;
    setCell(agHeadR, 31, "Operador", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 32, "Fecha", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 33, "Prioridad", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 34, "Creación/Toma ", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 35, "Items", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(agHeadR, 36, "%referencia", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 37, "% evaluatorio", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 38, "Cumple", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 39, "Comentarios", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(agHeadR, 40, "Items categoría MDA", XLSX_STYLE_INDEX.HEADER_LEFT);
    setCell(agHeadR, 41, "%referencia", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 42, "% evaluatorio", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 43, "Cumple", XLSX_STYLE_INDEX.HEADER_CENTER);
    setCell(agHeadR, 44, "Comentarios", XLSX_STYLE_INDEX.HEADER_LEFT);

    // --- 1. POPULATE CALL DATA ---
    const callAudit = callAudits[sIdx];
    if (callAudit) {
      const scoreMap = new Map<string, { score: boolean; comment?: string | null }>();
      (callAudit.scores || []).forEach((s) => {
        scoreMap.set(s.parameterCode, { score: s.score, comment: s.comment });
      });

      setCell(callB + 2, 1, operatorName, XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(callB + 2, 2, callAudit.callId || "", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(callB + 2, 3, callAudit.ringTime || "00:00:00", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(callB + 2, 4, callAudit.duration || "00:00:00", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(callB + 3, 1, "Fecha", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(callB + 4, 1, callAudit.date ? callAudit.date.substring(0, 10) : "", XLSX_STYLE_INDEX.DATA_CENTER);

      // S1 Items (Rows 2 to 11)
      let s1TotalEval = 0;
      callS1Items.forEach((item, k) => {
        const row = callB + 2 + k;
        setCell(row, 5, item.name, XLSX_STYLE_INDEX.DATA_TEXT);
        setCell(row, 6, item.ref, XLSX_STYLE_INDEX.DATA_PERCENT);
        const sc = scoreMap.get(item.code);
        const { label, styleId, meets } = cumpleCell(sc);
        const evalScore = meets ? item.ref : 0;
        s1TotalEval += evalScore;
        setCell(row, 7, evalScore, XLSX_STYLE_INDEX.DATA_PERCENT);
        setCell(row, 8, label, styleId);
        if (sc?.comment) setCell(row, 9, sc.comment, XLSX_STYLE_INDEX.DATA_TEXT);
      });

      // Solicitud (Row 12)
      setCell(callB + 12, 5, "Solicitud", XLSX_STYLE_INDEX.DATA_TEXT);
      setCell(callB + 12, 6, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(callB + 12, 7, "Ticket", XLSX_STYLE_INDEX.DATA_CENTER);
      const solMeets = callAudit.appliesMda !== false;
      setCell(callB + 12, 8, solMeets ? "CUMPLE" : "NO CUMPLE", solMeets ? XLSX_STYLE_INDEX.CUMPLE_TRUE : XLSX_STYLE_INDEX.CUMPLE_FALSE);
      setCell(callB + 12, 9, callAudit.ticketId || (callAudit.appliesMda === false ? "Sin ticket" : ""), XLSX_STYLE_INDEX.DATA_TEXT);

      // S2 Ticket Items (Rows 2 to 10)
      let s2TotalEval = 0;
      callS2Items.forEach((item, k) => {
        const row = callB + 2 + k;
        setCell(row, 10, item.name, XLSX_STYLE_INDEX.DATA_TEXT);
        setCell(row, 11, item.ref, XLSX_STYLE_INDEX.DATA_PERCENT);
        if (item.code === "call_ticket_reclamo_novedad") {
          const isRec = callAudit.isReclamoNovedad === true;
          setCell(row, 12, isRec ? item.ref : 0, XLSX_STYLE_INDEX.DATA_PERCENT);
          setCell(row, 13, isRec ? "CUMPLE" : "NO CUMPLE", isRec ? XLSX_STYLE_INDEX.CUMPLE_TRUE : XLSX_STYLE_INDEX.CUMPLE_FALSE);
          if (isRec) s2TotalEval = item.ref;
        } else {
          const sc = scoreMap.get(item.code);
          const { label, styleId, meets } = cumpleCell(sc);
          const evalScore = meets ? item.ref : 0;
          if (!callAudit.isReclamoNovedad) {
            s2TotalEval += evalScore;
          }
          setCell(row, 12, evalScore, XLSX_STYLE_INDEX.DATA_PERCENT);
          setCell(row, 13, label, styleId);
          if (sc?.comment) setCell(row, 14, sc.comment, XLSX_STYLE_INDEX.DATA_TEXT);
        }
      });

      // Row 15: Totals
      const hasSection2 = callAudit.appliesMda !== false;
      const s1Display = hasSection2 ? Math.round(s1TotalEval * 100) / 100 : Math.round((s1TotalEval / 0.45) * 100) / 100;
      const callCompliantCodes = new Set(
        (callAudit.scores || []).filter((s) => s.score).map((s) => s.parameterCode),
      );
      const computedCallScore = calculateMultiChannelAuditScores(
        "wise_call",
        wiseCallParams,
        callCompliantCodes,
        hasSection2,
        callAudit.isReclamoNovedad === true,
      );
      const totalScore = callAudit.totalScore ?? computedCallScore.totalScore;
      callScores[sIdx] = totalScore;
      const isApproved = totalScore >= QUALITY_APPROVAL_THRESHOLD;
      setCell(callB + 15, 5, "Cumplimientos ", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(callB + 15, 6, 1, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(callB + 15, 7, s1Display, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(callB + 15, 8, 1, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(callB + 15, 9, Math.round(s2TotalEval * 100) / 100, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(callB + 15, 12, "Total", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(callB + 15, 13, totalScore / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      setCell(
        callB + 15,
        14,
        isApproved ? "APROBADO" : "REPROBADO",
        isApproved ? XLSX_STYLE_INDEX.STATUS_APROBADO : XLSX_STYLE_INDEX.STATUS_REPROBADO,
      );
    }

    // --- 2. POPULATE EMAIL DATA ---
    const emailAudit = emailAudits[sIdx];
    if (emailAudit) {
      const scoreMap = new Map<string, { score: boolean; comment?: string | null }>();
      (emailAudit.scores || []).forEach((s) => {
        scoreMap.set(s.parameterCode, { score: s.score, comment: s.comment });
      });

      setCell(mailB + 2, 16, operatorName, XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(mailB + 2, 17, emailAudit.date ? emailAudit.date.substring(0, 10) : "", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(mailB + 2, 18, emailAudit.takeTime || "00:00:00", XLSX_STYLE_INDEX.DATA_CENTER);

      setCell(mailB + 3, 16, "Número de caso Mail Wise", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(mailB + 4, 16, emailAudit.callId || "", XLSX_STYLE_INDEX.DATA_CENTER);

      // S1 Items (Rows 2 to 8)
      let s1TotalEval = 0;
      emailS1Items.forEach((item, k) => {
        const row = mailB + 2 + k;
        setCell(row, 20, item.name, XLSX_STYLE_INDEX.DATA_TEXT);
        setCell(row, 21, item.ref, XLSX_STYLE_INDEX.DATA_PERCENT);
        const sc = scoreMap.get(item.code);
        const { label, styleId, meets } = cumpleCell(sc);
        const evalScore = meets ? item.ref : 0;
        s1TotalEval += evalScore;
        setCell(row, 22, evalScore, XLSX_STYLE_INDEX.DATA_PERCENT);
        setCell(row, 23, label, styleId);
        if (sc?.comment) setCell(row, 24, sc.comment, XLSX_STYLE_INDEX.DATA_TEXT);
      });

      // Solicitud (Row 9)
      setCell(mailB + 9, 20, "Solicitud", XLSX_STYLE_INDEX.DATA_TEXT);
      setCell(mailB + 9, 21, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(mailB + 9, 22, "Ticket", XLSX_STYLE_INDEX.DATA_CENTER);
      const solSc = scoreMap.get("email_solicitud");
      const solMeets = solSc?.score !== false;
      setCell(mailB + 9, 23, solMeets ? "CUMPLE" : "NO CUMPLE", solMeets ? XLSX_STYLE_INDEX.CUMPLE_TRUE : XLSX_STYLE_INDEX.CUMPLE_FALSE);
      setCell(mailB + 9, 24, emailAudit.ticketId || solSc?.comment || "", XLSX_STYLE_INDEX.DATA_TEXT);

      // SLA 90 min (Row 10)
      setCell(mailB + 10, 20, "Responde dentro del tiempo establecido 90min", XLSX_STYLE_INDEX.DATA_TEXT);
      setCell(mailB + 10, 21, 0.2, XLSX_STYLE_INDEX.DATA_PERCENT);
      const slaSc = scoreMap.get("email_sla_90min");
      const { label: slaLabel, styleId: slaStyleId, meets: slaMeets } = cumpleCell(slaSc);
      const slaScore = slaMeets ? 0.2 : 0;
      s1TotalEval += slaScore;
      setCell(mailB + 10, 22, slaScore, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(mailB + 10, 23, slaLabel, slaStyleId);
      if (slaSc?.comment) setCell(mailB + 10, 24, slaSc.comment, XLSX_STYLE_INDEX.DATA_TEXT);

      // Aplica MDA (Row 11)
      const appliesMda = emailAudit.appliesMda !== false;
      setCell(mailB + 11, 20, "¿Aplica evaluación MDA?", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(mailB + 11, 21, "SI", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(mailB + 11, 22, "NO", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(mailB + 11, 23, appliesMda ? "SI" : "NO", XLSX_STYLE_INDEX.DATA_CENTER);

      // S2 Items MDA (Rows 2 to 13)
      let s2TotalEval = 0;
      emailS2Items.forEach((item, k) => {
        const row = mailB + 2 + k;
        setCell(row, 25, item.name, XLSX_STYLE_INDEX.DATA_TEXT);
        setCell(row, 26, item.ref, XLSX_STYLE_INDEX.DATA_PERCENT);
        if (item.code === "email_mda_reclamo_novedad") {
          const isRec = emailAudit.isReclamoNovedad === true;
          setCell(row, 27, isRec ? item.ref : 0, XLSX_STYLE_INDEX.DATA_PERCENT);
          setCell(row, 28, isRec ? "CUMPLE" : "NO CUMPLE", isRec ? XLSX_STYLE_INDEX.CUMPLE_TRUE : XLSX_STYLE_INDEX.CUMPLE_FALSE);
          if (isRec) s2TotalEval = 1;
        } else {
          const sc = scoreMap.get(item.code);
          const { label, styleId, meets } = cumpleCell(sc);
          const evalScore = meets ? item.ref : 0;
          if (!emailAudit.isReclamoNovedad) {
            s2TotalEval += evalScore;
          }
          setCell(row, 27, evalScore, XLSX_STYLE_INDEX.DATA_PERCENT);
          setCell(row, 28, label, styleId);
          if (sc?.comment) setCell(row, 29, sc.comment, XLSX_STYLE_INDEX.DATA_TEXT);
        }
      });

      // Row 14: Totals
      const emailCompliantCodes = new Set(
        (emailAudit.scores || []).filter((s) => s.score).map((s) => s.parameterCode),
      );
      const computedEmailScore = calculateMultiChannelAuditScores(
        "wise_email",
        wiseEmailParams,
        emailCompliantCodes,
        appliesMda,
        emailAudit.isReclamoNovedad === true,
      );
      const totalScore = emailAudit.totalScore ?? computedEmailScore.totalScore;
      emailScores[sIdx] = totalScore;
      const isApproved = totalScore >= QUALITY_APPROVAL_THRESHOLD;
      setCell(mailB + 14, 20, "Cumplimientos ", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(mailB + 14, 21, 1, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(mailB + 14, 22, Math.round(s1TotalEval * 100) / 100, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(mailB + 14, 23, 1, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(mailB + 14, 24, Math.round(s2TotalEval * 100) / 100, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(mailB + 14, 25, "Parcial", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(mailB + 14, 26, Math.round((s1TotalEval + s2TotalEval) * 100) / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      setCell(mailB + 14, 27, "Total", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(mailB + 14, 28, totalScore / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      setCell(
        mailB + 14,
        29,
        isApproved ? "APROBADO" : "REPROBADO",
        isApproved ? XLSX_STYLE_INDEX.STATUS_APROBADO : XLSX_STYLE_INDEX.STATUS_REPROBADO,
      );
    }

    // --- 3. POPULATE AUTOGESTIONES DATA ---
    const agAudit = agAudits[sIdx];
    if (agAudit) {
      const scoreMap = new Map<string, { score: boolean; comment?: string | null }>();
      (agAudit.scores || []).forEach((s) => {
        scoreMap.set(s.parameterCode, { score: s.score, comment: s.comment });
      });

      setCell(agB + 2, 31, operatorName, XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 2, 32, agAudit.date ? agAudit.date.substring(0, 10) : "", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 2, 33, agAudit.priority || "-", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 2, 34, agAudit.takeTime || "00:00:00", XLSX_STYLE_INDEX.DATA_CENTER);

      setCell(agB + 3, 31, "Número de caso AG", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(agB + 3, 32, "Es PAS", XLSX_STYLE_INDEX.SUMMARY_LABEL);

      setCell(agB + 4, 31, agAudit.ticketId || "", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 4, 32, agAudit.isPas ? "SI" : "NO", XLSX_STYLE_INDEX.DATA_CENTER);

      // S1 Items (Rows 2 to 9)
      let s1TotalEval = 0;
      agS1Items.forEach((item, k) => {
        const row = agB + 2 + k;
        setCell(row, 35, item.name, XLSX_STYLE_INDEX.DATA_TEXT);
        setCell(row, 36, item.ref, XLSX_STYLE_INDEX.DATA_PERCENT);
        const sc = scoreMap.get(item.code);
        const { label, styleId, meets } = cumpleCell(sc);
        const evalScore = meets ? item.ref : 0;
        s1TotalEval += evalScore;
        setCell(row, 37, evalScore, XLSX_STYLE_INDEX.DATA_PERCENT);
        setCell(row, 38, label, styleId);
        if (sc?.comment) setCell(row, 39, sc.comment, XLSX_STYLE_INDEX.DATA_TEXT);
      });

      // Queda en MDA (Row 10)
      const staysInMda = agAudit.staysInMda !== false;
      setCell(agB + 10, 35, "¿Queda el caso en MDA?", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(agB + 10, 36, "SI", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 10, 37, "NO", XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 10, 38, staysInMda ? "SI" : "NO", XLSX_STYLE_INDEX.DATA_CENTER);

      // S2 Items MDA (Rows 2 to 7)
      let s2TotalEval = 0;
      agS2Items.forEach((item, k) => {
        const row = agB + 2 + k;
        setCell(row, 40, item.name, XLSX_STYLE_INDEX.DATA_TEXT);
        setCell(row, 41, item.ref, XLSX_STYLE_INDEX.DATA_PERCENT);
        const sc = scoreMap.get(item.code);
        const { label, styleId, meets } = cumpleCell(sc);
        const evalScore = meets ? item.ref : 0;
        s2TotalEval += evalScore;
        setCell(row, 42, evalScore, XLSX_STYLE_INDEX.DATA_PERCENT);
        setCell(row, 43, label, styleId);
        if (sc?.comment) setCell(row, 44, sc.comment, XLSX_STYLE_INDEX.DATA_TEXT);
      });

      // Row 14: Totals
      const agCompliantCodes = new Set(
        (agAudit.scores || []).filter((s) => s.score).map((s) => s.parameterCode),
      );
      const computedAgScore = calculateMultiChannelAuditScores(
        "invgate_ticket",
        invgateAgParams,
        agCompliantCodes,
        staysInMda,
        false,
      );
      const totalScore = agAudit.totalScore ?? computedAgScore.totalScore;
      agScores[sIdx] = totalScore;
      const isApproved = totalScore >= QUALITY_APPROVAL_THRESHOLD;
      setCell(agB + 14, 35, "Cumplimientos ", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(agB + 14, 36, 1, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(agB + 14, 37, Math.round(s1TotalEval * 100) / 100, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(agB + 14, 38, 1, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(agB + 14, 39, Math.round(s2TotalEval * 100) / 100, XLSX_STYLE_INDEX.DATA_PERCENT);
      setCell(agB + 14, 40, "Parcial", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(agB + 14, 41, staysInMda ? 2 : 1, XLSX_STYLE_INDEX.DATA_CENTER);
      setCell(agB + 14, 42, "Total", XLSX_STYLE_INDEX.SUMMARY_LABEL);
      setCell(agB + 14, 43, totalScore / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      setCell(
        agB + 14,
        44,
        isApproved ? "APROBADO" : "REPROBADO",
        isApproved ? XLSX_STYLE_INDEX.STATUS_APROBADO : XLSX_STYLE_INDEX.STATUS_REPROBADO,
      );
    }
  }

  // --- RESULTADOS & PROMEDIOS (Matches Original Excel Rows 62-73) ---

  // 1. Mails Results (Cols 16 & 17, Rows 62-67)
  setCell(62, 16, "RESULTADOS", XLSX_STYLE_INDEX.HEADER_CENTER);
  for (let i = 0; i < 4; i++) {
    setCell(63 + i, 16, `Muestreo ${i + 1}`, XLSX_STYLE_INDEX.SUMMARY_LABEL);
    const sc = emailScores[i];
    if (sc !== null && sc !== undefined) {
      setCell(63 + i, 17, sc / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
    }
  }
  setCell(67, 16, "Promedio total", XLSX_STYLE_INDEX.SUMMARY_LABEL);
  const validEmailScores = emailScores.filter((s): s is number => s !== null && s !== undefined);
  if (validEmailScores.length > 0) {
    const avgEmail = validEmailScores.reduce((a, b) => a + b, 0) / validEmailScores.length;
    setCell(67, 17, Math.round(avgEmail * 100) / 10000, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
  }

  // 2. Calls Results (Cols 1 & 2, Rows 68-73)
  setCell(68, 1, "RESULTADOS", XLSX_STYLE_INDEX.HEADER_CENTER);
  for (let i = 0; i < 4; i++) {
    setCell(69 + i, 1, `Muestreo ${i + 1}`, XLSX_STYLE_INDEX.SUMMARY_LABEL);
    const sc = callScores[i];
    if (sc !== null && sc !== undefined) {
      setCell(69 + i, 2, sc / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
    }
  }
  setCell(73, 1, "Promedio total", XLSX_STYLE_INDEX.SUMMARY_LABEL);
  const validCallScores = callScores.filter((s): s is number => s !== null && s !== undefined);
  if (validCallScores.length > 0) {
    const avgCall = validCallScores.reduce((a, b) => a + b, 0) / validCallScores.length;
    setCell(73, 2, Math.round(avgCall * 100) / 10000, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
  }

  // 3. Autogestiones Results (Cols 31 & 32, Rows 68-73)
  setCell(68, 31, "RESULTADOS", XLSX_STYLE_INDEX.HEADER_CENTER);
  for (let i = 0; i < 4; i++) {
    setCell(69 + i, 31, `Muestreo ${i + 1}`, XLSX_STYLE_INDEX.SUMMARY_LABEL);
    const sc = agScores[i];
    if (sc !== null && sc !== undefined) {
      setCell(69 + i, 32, sc / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
    }
  }
  setCell(73, 31, "Promedio total", XLSX_STYLE_INDEX.SUMMARY_LABEL);
  const validAgScores = agScores.filter((s): s is number => s !== null && s !== undefined);
  if (validAgScores.length > 0) {
    const avgAg = validAgScores.reduce((a, b) => a + b, 0) / validAgScores.length;
    setCell(73, 32, Math.round(avgAg * 100) / 10000, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
  }

  // Convert rowMap to sorted rawRows array
  const rawRows: { rowNum: number; cells: XlsxCellData[] }[] = [];
  const sortedRowNums = [...rowMap.keys()].sort((a, b) => a - b);
  for (const rNum of sortedRowNums) {
    const colMap = rowMap.get(rNum)!;
    const cells: XlsxCellData[] = [];
    const sortedCols = [...colMap.keys()].sort((a, b) => a - b);
    for (const cIdx of sortedCols) {
      const entry = colMap.get(cIdx)!;
      cells.push({
        colIdx: cIdx - 1, // 0-based for getColLetter
        value: entry.val,
        styleId: entry.styleId,
      });
    }
    rawRows.push({
      rowNum: rNum,
      cells,
    });
  }

  // Define column widths based on original Excel
  const colWidths: XlsxColWidth[] = [
    { colIdx: 0, width: 18 }, // A: Operador
    { colIdx: 1, width: 18 }, // B: Caso LLamado
    { colIdx: 2, width: 17 }, // C: Ringueo
    { colIdx: 3, width: 13 }, // D: Duracion
    { colIdx: 4, width: 37 }, // E: Items
    { colIdx: 5, width: 11 }, // F: %ref
    { colIdx: 6, width: 11 }, // G: %eval
    { colIdx: 7, width: 9 },  // H: Cumple
    { colIdx: 8, width: 25 }, // I: Comentarios
    { colIdx: 9, width: 34 }, // J: TICKET
    { colIdx: 10, width: 11 }, // K: %ref
    { colIdx: 11, width: 12 }, // L: %eval
    { colIdx: 12, width: 12 }, // M: Cumple
    { colIdx: 13, width: 25 }, // N: Comentarios
    { colIdx: 14, width: 4 },  // O: Separator
    { colIdx: 15, width: 18 }, // P: Operador Mail
    { colIdx: 16, width: 14 }, // Q: Fecha
    { colIdx: 17, width: 14 }, // R: Creacion/Toma
    { colIdx: 18, width: 4 },  // S: Separator
    { colIdx: 19, width: 37 }, // T: Items Mail
    { colIdx: 20, width: 11 }, // U: %ref
    { colIdx: 21, width: 11 }, // V: %eval
    { colIdx: 22, width: 9 },  // W: Cumple
    { colIdx: 23, width: 25 }, // X: Comentarios
    { colIdx: 24, width: 34 }, // Y: Items MDA
    { colIdx: 25, width: 11 }, // Z: %ref
    { colIdx: 26, width: 11 }, // AA: %eval
    { colIdx: 27, width: 12 }, // AB: Cumple
    { colIdx: 28, width: 25 }, // AC: Comentarios
    { colIdx: 29, width: 4 },  // AD: Separator
    { colIdx: 30, width: 18 }, // AE: Operador AG
    { colIdx: 31, width: 14 }, // AF: Fecha
    { colIdx: 32, width: 11 }, // AG: Prioridad
    { colIdx: 33, width: 14 }, // AH: Toma
    { colIdx: 34, width: 37 }, // AI: Items AG
    { colIdx: 35, width: 11 }, // AJ: %ref
    { colIdx: 36, width: 11 }, // AK: %eval
    { colIdx: 37, width: 9 },  // AL: Cumple
    { colIdx: 38, width: 25 }, // AM: Comentarios
    { colIdx: 39, width: 34 }, // AN: Items MDA AG
    { colIdx: 40, width: 11 }, // AO: %ref
    { colIdx: 41, width: 11 }, // AP: %eval
    { colIdx: 42, width: 12 }, // AQ: Cumple
    { colIdx: 43, width: 25 }, // AR: Comentarios
  ];

  return {
    name: operatorName.substring(0, 31),
    colWidths,
    rawRows,
  };
}

export interface OperatorMonthlySummary {
  name: string;
  callAvg: number | null;
  emailAvg: number | null;
  agAvg: number | null;
  overallAvg: number;
}

export function buildGeneralSummarySheet(
  monthLabel: string,
  operatorSummaries: OperatorMonthlySummary[],
): {
  name: string;
  colWidths: XlsxColWidth[];
  rawRows: {
    rowNum: number;
    cells: XlsxCellData[];
  }[];
} {
  const rowMap = new Map<number, Map<number, { val: string | number | boolean | null | undefined; styleId?: number }>>();

  const setCell = (
    row: number,
    col: number,
    val: string | number | boolean | null | undefined,
    styleId: number = XLSX_STYLE_INDEX.DATA_TEXT,
  ) => {
    if (!rowMap.has(row)) {
      rowMap.set(row, new Map());
    }
    rowMap.get(row)!.set(col, { val, styleId });
  };

  // Row 1: Title
  setCell(1, 1, `MDA - Gestión de Desempeño - ${monthLabel || "General"}`, XLSX_STYLE_INDEX.HEADER_LEFT);
  setCell(1, 2, "", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(1, 3, "", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(1, 4, "", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(1, 5, "", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(1, 6, "", XLSX_STYLE_INDEX.HEADER_CENTER);

  // Row 2: Headers
  setCell(2, 1, "Operador", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(2, 2, "Llamados", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(2, 3, "Mails", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(2, 4, "Autogestiones", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(2, 5, "Promedio", XLSX_STYLE_INDEX.HEADER_CENTER);
  setCell(2, 6, "Estado", XLSX_STYLE_INDEX.HEADER_CENTER);

  let totalCallSum = 0;
  let totalCallCount = 0;
  let totalEmailSum = 0;
  let totalEmailCount = 0;
  let totalAgSum = 0;
  let totalAgCount = 0;
  let totalOverallSum = 0;

  operatorSummaries.forEach((op, idx) => {
    const row = 3 + idx;
    setCell(row, 1, op.name, XLSX_STYLE_INDEX.DATA_TEXT);

    if (op.callAvg !== null) {
      setCell(row, 2, op.callAvg / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      totalCallSum += op.callAvg;
      totalCallCount++;
    } else {
      setCell(row, 2, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
    }

    if (op.emailAvg !== null) {
      setCell(row, 3, op.emailAvg / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      totalEmailSum += op.emailAvg;
      totalEmailCount++;
    } else {
      setCell(row, 3, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
    }

    if (op.agAvg !== null) {
      setCell(row, 4, op.agAvg / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
      totalAgSum += op.agAvg;
      totalAgCount++;
    } else {
      setCell(row, 4, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
    }

    setCell(row, 5, op.overallAvg / 100, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
    totalOverallSum += op.overallAvg;

    const isApproved = op.overallAvg >= QUALITY_APPROVAL_THRESHOLD;
    setCell(
      row,
      6,
      isApproved ? "APROBADO" : "REPROBADO",
      isApproved ? XLSX_STYLE_INDEX.STATUS_APROBADO : XLSX_STYLE_INDEX.STATUS_REPROBADO,
    );
  });

  // Total MDA row
  const totalRow = 3 + operatorSummaries.length;
  setCell(totalRow, 1, "Promedio MDA", XLSX_STYLE_INDEX.SUMMARY_LABEL);
  if (totalCallCount > 0) {
    setCell(totalRow, 2, Math.round((totalCallSum / totalCallCount) * 100) / 10000, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
  } else {
    setCell(totalRow, 2, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
  }

  if (totalEmailCount > 0) {
    setCell(totalRow, 3, Math.round((totalEmailSum / totalEmailCount) * 100) / 10000, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
  } else {
    setCell(totalRow, 3, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
  }

  if (totalAgCount > 0) {
    setCell(totalRow, 4, Math.round((totalAgSum / totalAgCount) * 100) / 10000, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
  } else {
    setCell(totalRow, 4, "n/a", XLSX_STYLE_INDEX.DATA_CENTER);
  }

  if (operatorSummaries.length > 0) {
    const mdaOverall = Math.round((totalOverallSum / operatorSummaries.length) * 100) / 10000;
    setCell(totalRow, 5, mdaOverall, XLSX_STYLE_INDEX.DATA_PERCENT_DECIMAL);
    setCell(
      totalRow,
      6,
      mdaOverall >= QUALITY_APPROVAL_THRESHOLD / 100 ? "APROBADO" : "REPROBADO",
      mdaOverall >= QUALITY_APPROVAL_THRESHOLD / 100 ? XLSX_STYLE_INDEX.STATUS_APROBADO : XLSX_STYLE_INDEX.STATUS_REPROBADO,
    );
  }

  const rawRows: { rowNum: number; cells: XlsxCellData[] }[] = [];
  const sortedRowNums = [...rowMap.keys()].sort((a, b) => a - b);
  for (const rNum of sortedRowNums) {
    const colMap = rowMap.get(rNum)!;
    const cells: XlsxCellData[] = [];
    const sortedCols = [...colMap.keys()].sort((a, b) => a - b);
    for (const cIdx of sortedCols) {
      const entry = colMap.get(cIdx)!;
      cells.push({
        colIdx: cIdx - 1,
        value: entry.val,
        styleId: entry.styleId,
      });
    }
    rawRows.push({
      rowNum: rNum,
      cells,
    });
  }

  const colWidths: XlsxColWidth[] = [
    { colIdx: 0, width: 28 }, // Operador
    { colIdx: 1, width: 16 }, // Llamados
    { colIdx: 2, width: 16 }, // Mails
    { colIdx: 3, width: 18 }, // Autogestiones
    { colIdx: 4, width: 18 }, // Promedio General
    { colIdx: 5, width: 16 }, // Estado
  ];

  return {
    name: "MDA - Promedio General",
    colWidths,
    rawRows,
  };
}

