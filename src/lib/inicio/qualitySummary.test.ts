import test from "node:test";
import assert from "node:assert/strict";
import { summarizeQuality } from "./qualitySummary.js";

test("summarizeQuality: calcula correctamente solo con auditorías publicadas y descarta borradores", () => {
  const currentAudits = [
    { channelType: "wise_call", totalScore: 100, status: "published" },
    { channelType: "wise_call", totalScore: 50, status: "draft" }, // Borrador: debe ignorarse
    { channelType: "wise_email", totalScore: 80, status: "published" },
    { channelType: "invgate_ticket", totalScore: 0, status: "draft" }, // Borrador: debe ignorarse
  ];

  const previousAudits = [
    { channelType: "wise_call", totalScore: 80, status: "published" },
    { channelType: "wise_call", totalScore: 20, status: "draft" },
  ];

  const summary = summarizeQuality(currentAudits, previousAudits, "11-2026");

  // currentAudits válidos publicados: 1 call (100) y 1 email (80).
  // Promedio por canal: wise_call = 100, wise_email = 80.
  // Promedio global: (100 + 80) / 2 = 90.
  assert.equal(summary.auditsCount, 2, "Solo deben computarse 2 auditorías publicadas");
  assert.equal(summary.average, 90, "El promedio debe calcularse sobre las publicadas");

  // previousAudits válidos publicados: 1 call (80)
  assert.equal(summary.previousCount, 1);
  assert.equal(summary.previousAverage, 80);
  assert.equal(summary.delta, 10);
});

test("summarizeQuality: si un operador solo tiene borradores, el promedio es 0 y auditsCount es 0", () => {
  const allDrafts = [
    { channelType: "wise_call", totalScore: 100, status: "draft" },
    { channelType: "wise_email", totalScore: 90, status: "draft" },
  ];

  const summary = summarizeQuality(allDrafts, [], "11-2026");

  assert.equal(summary.auditsCount, 0);
  assert.equal(summary.average, 0);
  assert.equal(summary.previousAverage, null);
  assert.equal(summary.delta, null);
});
