import { describe, it, expect } from "vitest";
import { calculateMultiChannelAuditScores } from "../../src/lib/qualityCalculator";
import {
  WISE_CALL_PARAMETERS,
  WISE_EMAIL_PARAMETERS,
} from "../../src/config/qualityParams";

describe("Quality Calculator - Reclamo / Novedad Logic", () => {
  describe("Wise Call Channel", () => {
    it("gives 100% to section 2 and full 55 points when isReclamoNovedad is true, even if no ticket parameters are checked", () => {
      // Only Section 1 parameters compliant, NO ticket parameters compliant
      const compliantCodes = new Set(
        WISE_CALL_PARAMETERS.filter((p) => p.section === "items").map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        compliantCodes,
        true, // hasSection2
        true, // isReclamoNovedad = true!
      );

      expect(res.section1Score).toBe(100);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(100);
    });

    it("correctly preserves Section 1 deductions and awards 55 ticket points on Reclamo / Novedad", () => {
      // Deduct call_procedimiento (-10) in Section 1
      // s1Raw = 45 - 10 = 35. s1Score = Math.round((35 / 45) * 100) = 78%
      // Total with Reclamo / Novedad: 35 + 55 = 90%
      const compliantCodes = new Set(
        WISE_CALL_PARAMETERS.filter(
          (p) => p.section === "items" && p.code !== "call_procedimiento",
        ).map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        compliantCodes,
        true,
        true, // isReclamoNovedad = true
      );

      expect(res.section1Score).toBe(78);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(90);
    });

    it("evaluates ticket parameters individually when isReclamoNovedad is false", () => {
      // Section 1 all compliant. Section 2 has deduction: call_ticket_categorizacion (-10)
      // s1Raw = 45. s2Raw = 55 - 10 = 45. s2Score = Math.round((45 / 55) * 100) = 82%
      // Total: 45 + 45 = 90%
      const compliantCodes = new Set(
        WISE_CALL_PARAMETERS.filter((p) => p.code !== "call_ticket_categorizacion").map(
          (p) => p.code,
        ),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        compliantCodes,
        true,
        false, // isReclamoNovedad = false
      );

      expect(res.section1Score).toBe(100);
      expect(res.section2Score).toBe(82);
      expect(res.totalScore).toBe(90);
    });
  });

  describe("Wise Email Channel", () => {
    it("gives 100% to section 2 (MDA) when isReclamoNovedad is true", () => {
      // Only Section 1 parameters compliant
      const compliantCodes = new Set(
        WISE_EMAIL_PARAMETERS.filter((p) => p.section === "items").map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        compliantCodes,
        true, // hasSection2
        true, // isReclamoNovedad = true
      );

      expect(res.section1Score).toBe(100);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(100);
    });

    it("correctly preserves Section 1 deductions and awards 100% to Section 2 on Reclamo / Novedad in email", () => {
      // Deduct email_interpretacion (-10) in Section 1
      // s1Score = 100 - 10 = 90%.
      // Total with Reclamo / Novedad: Math.round((90 + 100) / 2) = 95%
      const compliantCodes = new Set(
        WISE_EMAIL_PARAMETERS.filter(
          (p) => p.section === "items" && p.code !== "email_interpretacion",
        ).map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        compliantCodes,
        true,
        true, // isReclamoNovedad = true
      );

      expect(res.section1Score).toBe(90);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(95);
    });

    it("evaluates MDA ticket parameters individually when isReclamoNovedad is false in email", () => {
      // Section 1 all compliant (100%).
      // Section 2 has deduction: email_mda_categorizacion (-10%)
      // s2Score = 100 - 10 = 90%. Total = Math.round((100 + 90) / 2) = 95%
      const compliantCodes = new Set(
        WISE_EMAIL_PARAMETERS.filter((p) => p.code !== "email_mda_categorizacion").map(
          (p) => p.code,
        ),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        compliantCodes,
        true,
        false, // isReclamoNovedad = false
      );

      expect(res.section1Score).toBe(100);
      expect(res.section2Score).toBe(90);
      expect(res.totalScore).toBe(95);
    });

    // "No aplica" (hasSection2=false) NO es un reclamo: deshabilita la
    // sección 2, mientras que el reclamo la exime al 100%. Por eso el reclamo
    // pone un piso del 50% al total (puede promediar 0 con 100) y el "sin
    // ticket" no: el total es el de la sección 1 y puede llegar a 0.
    it("makes the total equal section 1 when the mail had no MDA ticket", () => {
      // Fallar 4 items de 50 puntos deja S1 en 50%.
      const compliantCodes = new Set(
        WISE_EMAIL_PARAMETERS.filter(
          (p) =>
            p.section === "items" &&
            !["email_procedimientos", "email_gestion_herramientas", "email_resolucion", "email_seguimiento"].includes(p.code),
        ).map((p) => p.code),
      );

      const sinTicket = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        compliantCodes,
        false, // hasSection2 = false
        false,
      );
      expect(sinTicket.section1Score).toBe(50);
      expect(sinTicket.totalScore).toBe(50);

      // El mismo mail como reclamo: el total sube a 75 y no puede bajar de 50.
      const comoReclamo = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        compliantCodes,
        true,
        true,
      );
      expect(comoReclamo.section2Score).toBe(100);
      expect(comoReclamo.totalScore).toBe(75);
    });

    it("lets a disastrous section 1 reach 0 without a ticket, but never with a reclamo", () => {
      // Ningún item con peso cumplido: S1 = 0.
      const nadaCumplido = new Set<string>();
      const masTodos = new Set(WISE_EMAIL_PARAMETERS.map((p) => p.code));

      const sinTicket = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        nadaCumplido,
        false,
        false,
      );
      expect(sinTicket.totalScore).toBe(0);

      const comoReclamo = calculateMultiChannelAuditScores(
        "wise_email",
        WISE_EMAIL_PARAMETERS,
        masTodos,
        true,
        true,
      );
      expect(comoReclamo.totalScore).toBe(100);
    });
  });
});
