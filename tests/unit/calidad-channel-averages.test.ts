import { describe, it, expect } from "vitest";
import {
  calculateChannelAverages,
  formatChannelAverageScore,
  getChannelAverageBadgeClass,
} from "../../src/lib/qualityCalculator";

describe("Calidad Channel Averages & Consolidated Overall Score", () => {
  it("calculates accurate simple averages per channel and total consolidated across all audits", () => {
    const audits = [
      // 2 Wise Calls: 80, 100 -> avg = 90
      { channelType: "wise_call", totalScore: 80 },
      { channelType: "wise_call", totalScore: 100 },
      // 1 Wise Email: 60 -> avg = 60
      { channelType: "wise_email", totalScore: 60 },
      // 3 InvGate AGs: 90, 95, 85 -> avg = 90
      { channelType: "invgate_ticket", totalScore: 90 },
      { channelType: "invgate_ticket", totalScore: 95 },
      { channelType: "invgate_ticket", totalScore: 85 },
    ];

    const stats = calculateChannelAverages(audits);

    expect(stats.wiseCallsAvg).toBe(90);
    expect(stats.wiseCallsCount).toBe(2);

    expect(stats.wiseEmailsAvg).toBe(60);
    expect(stats.wiseEmailsCount).toBe(1);

    expect(stats.invgateTicketAvg).toBe(90);
    expect(stats.invgateTicketCount).toBe(3);

    expect(stats.totalCount).toBe(6);
    // Simple arithmetic mean of all 6 audits: (80 + 100 + 60 + 90 + 95 + 85) / 6 = 510 / 6 = 85
    expect(stats.overallAvg).toBe(85);
  });

  it("handles empty channels cleanly returning null/0 for empty sets", () => {
    const audits = [
      { channelType: "wise_call", totalScore: 95 },
    ];

    const stats = calculateChannelAverages(audits);

    expect(stats.wiseCallsAvg).toBe(95);
    expect(stats.wiseCallsCount).toBe(1);

    expect(stats.wiseEmailsAvg).toBeNull();
    expect(stats.wiseEmailsCount).toBe(0);

    expect(stats.invgateTicketAvg).toBeNull();
    expect(stats.invgateTicketCount).toBe(0);

    expect(stats.totalCount).toBe(1);
    expect(stats.overallAvg).toBe(95);
  });

  it("returns null for all averages when there are no audits at all", () => {
    const stats = calculateChannelAverages([]);

    expect(stats.wiseCallsAvg).toBeNull();
    expect(stats.wiseCallsCount).toBe(0);
    expect(stats.wiseEmailsAvg).toBeNull();
    expect(stats.wiseEmailsCount).toBe(0);
    expect(stats.invgateTicketAvg).toBeNull();
    expect(stats.invgateTicketCount).toBe(0);
    expect(stats.totalCount).toBe(0);
    expect(stats.overallAvg).toBeNull();
  });

  it("defaults channelType to wise_call if missing or null", () => {
    const audits = [
      { totalScore: 88 },
      { channelType: undefined, totalScore: 92 },
    ];

    const stats = calculateChannelAverages(audits);

    expect(stats.wiseCallsAvg).toBe(90);
    expect(stats.wiseCallsCount).toBe(2);
    expect(stats.overallAvg).toBe(90);
  });

  it("formats score values correctly and returns fallback text for null/empty", () => {
    expect(formatChannelAverageScore(90)).toBe("90.0%");
    expect(formatChannelAverageScore(85.4)).toBe("85.4%");
    expect(formatChannelAverageScore(null)).toBe("--");
    expect(formatChannelAverageScore(undefined)).toBe("--");
  });

  it("assigns proper DaisyUI semantic badge classes based on threshold score", () => {
    expect(getChannelAverageBadgeClass(90)).toContain("badge-success");
    expect(getChannelAverageBadgeClass(80)).toContain("badge-warning");
    expect(getChannelAverageBadgeClass(65)).toContain("badge-error");
    expect(getChannelAverageBadgeClass(null)).toContain("badge-ghost");
  });
});
