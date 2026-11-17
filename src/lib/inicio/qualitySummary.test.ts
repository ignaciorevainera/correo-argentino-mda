import test from "node:test";
import assert from "node:assert/strict";
import { resolveQualitySummary, summarizeQuality } from "./qualitySummary.js";

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

test("resolveQualitySummary: muestra el mes más reciente con publicadas y su delta", () => {
  const months = [
    {
      month: "11-2026",
      audits: [{ channelType: "wise_call", totalScore: 100, status: "published" }],
    },
    {
      month: "10-2026",
      audits: [{ channelType: "wise_call", totalScore: 80, status: "published" }],
    },
    { month: "09-2026", audits: [] },
  ];

  const summary = resolveQualitySummary(months, "11-2026");

  assert.equal(summary.month, "11-2026");
  assert.equal(summary.monthLabel, "Noviembre 2026");
  assert.equal(summary.auditsCount, 1);
  assert.equal(summary.average, 100);
  assert.equal(summary.delta, 20);
});

test("resolveQualitySummary: cae al mes anterior si el actual está vacío", () => {
  const months = [
    { month: "11-2026", audits: [] },
    {
      month: "10-2026",
      audits: [
        { channelType: "wise_call", totalScore: 70, status: "published" },
        { channelType: "wise_email", totalScore: 90, status: "published" },
      ],
    },
    {
      month: "09-2026",
      audits: [{ channelType: "wise_call", totalScore: 60, status: "published" }],
    },
  ];

  const summary = resolveQualitySummary(months, "11-2026");

  assert.equal(summary.month, "10-2026");
  assert.equal(summary.monthLabel, "Octubre 2026");
  assert.equal(summary.auditsCount, 2);
  assert.equal(summary.average, 80, "Promedio de promedios por canal: (70 + 90) / 2");
  assert.equal(summary.delta, 20, "Delta contra septiembre (60)");
});

test("resolveQualitySummary: cae al ante-anterior y sin delta si no hay mes previo con datos", () => {
  const months = [
    { month: "11-2026", audits: [] },
    { month: "10-2026", audits: [] },
    {
      month: "09-2026",
      audits: [{ channelType: "wise_call", totalScore: 85, status: "published" }],
    },
  ];

  const summary = resolveQualitySummary(months, "11-2026");

  assert.equal(summary.month, "09-2026");
  assert.equal(summary.monthLabel, "Septiembre 2026");
  assert.equal(summary.auditsCount, 1);
  assert.equal(summary.average, 85);
  assert.equal(summary.delta, null, "Agosto no está en la ventana: sin delta");
});

test("resolveQualitySummary: sin datos en ningún mes devuelve resumen vacío del mes actual", () => {
  const months = [
    { month: "11-2026", audits: [] },
    { month: "10-2026", audits: [] },
    { month: "09-2026", audits: [] },
  ];

  const summary = resolveQualitySummary(months, "11-2026");

  assert.equal(summary.month, "11-2026");
  assert.equal(summary.auditsCount, 0);
  assert.equal(summary.average, 0);
  assert.equal(summary.delta, null);
});
