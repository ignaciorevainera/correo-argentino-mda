import { describe, it, expect } from "vitest";
import {
  calculateMultiChannelAuditScores,
  calculateOperatorChannelStats,
  getChannelAverageBadgeClass,
  getChannelAverageTextClass,
  hasSection2,
  hasSection2Evaluated,
} from "../../src/lib/qualityCalculator";
import {
  WISE_CALL_PARAMETERS,
  WISE_EMAIL_PARAMETERS,
} from "../../src/config/qualityParams";

describe("Multi-Channel Quality Calculator", () => {
  describe("Individual Audit Scoring (Deduction Method)", () => {
    it("gives 100% when all parameters are compliant", () => {
      const allCompliant = new Set(WISE_CALL_PARAMETERS.map((p) => p.code));
      const res = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        allCompliant,
        true, // hasSection2 (ticket applies)
      );

      expect(res.section1Score).toBe(100);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(100);
    });

    it("deducts percentages when parameters do not comply", () => {
      // In Wise Call:
      // call_cordialidad = 3 points
      // call_sondeo = 6 points
      // Both fail in Section 1 (base 45): (45 - 9) / 45 = 80%
      // Section 2 has 55 points (100%)
      // Total score: 36 + 55 = 91% (direct deduction from 100)
      const params = WISE_CALL_PARAMETERS;
      const compliantCodes = new Set(
        params
          .filter((p) => p.code !== "call_cordialidad" && p.code !== "call_sondeo")
          .map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_call",
        params,
        compliantCodes,
        true,
      );

      expect(res.section1Score).toBe(80);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(91);
    });

    it("gives 55% when all Section 1 fails and Section 2 passes in wise_call", () => {
      const params = WISE_CALL_PARAMETERS;
      // All section 2 compliant, all section 1 failing
      const compliantCodes = new Set(
        params.filter((p) => p.section === "ticket").map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_call",
        params,
        compliantCodes,
        true,
      );

      expect(res.section1Score).toBe(0);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(55);
    });

    it("evaluates only Section 1 when no ticket was generated in wise_call (hasSection2 = false)", () => {
      const params = WISE_CALL_PARAMETERS;
      // All section 1 compliant
      const allCompliant = new Set(params.map((p) => p.code));

      const resAllPass = calculateMultiChannelAuditScores(
        "wise_call",
        params,
        allCompliant,
        false, // hasSection2 = false (no se generó ticket)
      );

      expect(resAllPass.section1Score).toBe(100);
      expect(resAllPass.section2Score).toBe(0);
      expect(resAllPass.totalScore).toBe(100);

      // Con deducción en sección 1 (ej: call_procedimiento -10%)
      // s1Raw = 45 - 10 = 35. section1Score = Math.round((35 / 45) * 100) = 78
      const failProcedimiento = new Set(
        params.filter((p) => p.code !== "call_procedimiento").map((p) => p.code),
      );

      const resDeduction = calculateMultiChannelAuditScores(
        "wise_call",
        params,
        failProcedimiento,
        false,
      );

      expect(resDeduction.section1Score).toBe(78);
      expect(resDeduction.section2Score).toBe(0);
      expect(resDeduction.totalScore).toBe(78);
    });

    it("evaluates only Section 1 when Section 2 does not apply (e.g. Wise Email with appliesMda = false)", () => {
      const params = WISE_EMAIL_PARAMETERS;
      // Fail email_interpretacion (10%) in Section 1
      const compliantCodes = new Set(
        params
          .filter((p) => p.code !== "email_interpretacion")
          .map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_email",
        params,
        compliantCodes,
        false, // appliesMda = false
      );

      expect(res.section1Score).toBe(90);
      expect(res.section2Score).toBe(0);
      expect(res.totalScore).toBe(90); // 100% governed by Section 1
    });

    it("calculates exact 97% total (93% S1, 100% S2) when single 3pt item fails in canonical wise_call", () => {
      // 1 item fails: call_cordialidad (weight: 3)
      // S1: (45 - 3) / 45 * 100 = 93%
      // S2: (55 - 0) / 55 * 100 = 100%
      // Total: 42 + 55 = 97%
      const compliantCodes = new Set(
        WISE_CALL_PARAMETERS.filter((p) => p.code !== "call_cordialidad").map((p) => p.code),
      );

      const res = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        compliantCodes,
        true,
      );

      expect(res.section1Score).toBe(93);
      expect(res.section2Score).toBe(100);
      expect(res.totalScore).toBe(97);
    });

    it("clamps scores to 0 when deductions exceed 100", () => {
      const emptySet = new Set<string>();
      const res = calculateMultiChannelAuditScores(
        "wise_call",
        WISE_CALL_PARAMETERS,
        emptySet,
        true,
      );

      expect(res.section1Score).toBeGreaterThanOrEqual(0);
      expect(res.section2Score).toBe(0); // In Section 2, Reclamo/Novedad alone is 55% + others = >100%
      expect(res.totalScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Operator Monthly Channel Aggregations", () => {
    it("computes averages for the 3 channels and overall score", () => {
      const audits = [
        // 4 Wise Calls: 100, 90, 80, 90 -> avg = 90
        { channelType: "wise_call", totalScore: 100 },
        { channelType: "wise_call", totalScore: 90 },
        { channelType: "wise_call", totalScore: 80 },
        { channelType: "wise_call", totalScore: 90 },
        // 4 Wise Emails: 80, 80, 80, 80 -> avg = 80
        { channelType: "wise_email", totalScore: 80 },
        { channelType: "wise_email", totalScore: 80 },
        { channelType: "wise_email", totalScore: 80 },
        { channelType: "wise_email", totalScore: 80 },
        // 4 InvGate AGs: 100, 100, 100, 100 -> avg = 100
        { channelType: "invgate_ticket", totalScore: 100 },
        { channelType: "invgate_ticket", totalScore: 100 },
        { channelType: "invgate_ticket", totalScore: 100 },
        { channelType: "invgate_ticket", totalScore: 100 },
      ] as any[];

      const stats = calculateOperatorChannelStats(audits);

      expect(stats.wiseCallsAvg).toBe(90);
      expect(stats.wiseCallsCount).toBe(4);
      expect(stats.wiseEmailsAvg).toBe(80);
      expect(stats.wiseEmailsCount).toBe(4);
      expect(stats.invgateAgAvg).toBe(100);
      expect(stats.invgateAgCount).toBe(4);
      expect(stats.totalAuditsCount).toBe(12);
      expect(stats.quotaFulfilled).toBe(true);
      // Overall avg of 3 channels: (90 + 80 + 100) / 3 = 90
      expect(stats.globalAverage).toBe(90);
    });

    it("marks quotaFulfilled = false when any channel has less than 4 audits", () => {
      const partialAudits = [
        { channelType: "wise_call", totalScore: 90 },
        { channelType: "wise_call", totalScore: 90 },
        { channelType: "wise_email", totalScore: 80 },
      ] as any[];

      const stats = calculateOperatorChannelStats(partialAudits);
      expect(stats.quotaFulfilled).toBe(false);
      expect(stats.wiseCallsCount).toBe(2);
      expect(stats.wiseEmailsCount).toBe(1);
      expect(stats.invgateAgCount).toBe(0);
    });
  });

  describe("Section 2 applicability", () => {
    it("treats a call without a generated ticket as not applicable", () => {
      const a = { channelType: "wise_call", appliesMda: false, staysInMda: true };
      expect(hasSection2(a)).toBe(false);
      expect(hasSection2Evaluated(a)).toBe(false);
    });

    it("treats an email with no MDA ticket as not applicable", () => {
      const a = { channelType: "wise_email", appliesMda: false, staysInMda: true };
      expect(hasSection2(a)).toBe(false);
      expect(hasSection2Evaluated(a)).toBe(false);
    });

    it("treats an autogestion that did not stay in MDA as not applicable", () => {
      const a = { channelType: "invgate_ticket", appliesMda: true, staysInMda: false };
      expect(hasSection2(a)).toBe(false);
      expect(hasSection2Evaluated(a)).toBe(false);
    });

    // Frontera entre los dos helpers: el reclamo APLICA (por eso renderCallCard
    // sigue mostrando el desglose con badge "N/A (Reclamo)") pero NO fue
    // evaluado (por eso no aporta fallos a Insights ni entra al promedio).
    // Si alguien fusiona los helpers en uno, este test lo corta.
    it("keeps reclamo applicable but not evaluated", () => {
      const a = {
        channelType: "wise_call",
        appliesMda: true,
        staysInMda: true,
        isReclamoNovedad: true,
      };
      expect(hasSection2(a)).toBe(true);
      expect(hasSection2Evaluated(a)).toBe(false);
    });

    it("treats a standard call with a ticket as fully evaluated", () => {
      const a = {
        channelType: "wise_call",
        appliesMda: true,
        staysInMda: true,
        isReclamoNovedad: false,
      };
      expect(hasSection2(a)).toBe(true);
      expect(hasSection2Evaluated(a)).toBe(true);
    });

    it("defaults a legacy audit without channelType to wise_call semantics", () => {
      expect(hasSection2({ appliesMda: null })).toBe(true);
      expect(hasSection2({ appliesMda: false })).toBe(false);
    });
  });

  describe("Channel average tone", () => {
    it("shares one threshold between badge and text variants", () => {
      // 80 cae en warning: el badge y el texto tienen que coincidir.
      expect(getChannelAverageBadgeClass(80)).toContain("warning");
      expect(getChannelAverageTextClass(80)).toBe("text-warning");
      expect(getChannelAverageTextClass(90)).toBe("text-success");
      expect(getChannelAverageTextClass(60)).toBe("text-error");
      expect(getChannelAverageTextClass(null)).toBe("text-base-content/40");
    });
  });
});
