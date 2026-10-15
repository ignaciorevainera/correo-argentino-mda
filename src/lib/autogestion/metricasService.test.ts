import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDateRange,
  aggregateTemporal,
  aggregateByOperator,
  aggregateByType,
  calculateKpis,
  aggregateInvgateQueue,
  generateCsvExport,
} from "./metricasService";

test("parseDateRange handles presets correctly", () => {
  const now = new Date(2026, 9, 14, 12, 0, 0); // Oct 14 2026 12:00
  const rangeHoy = parseDateRange("hoy", undefined, undefined, now);
  assert.equal(rangeHoy.grouping, "hour");
  assert.equal(new Date(rangeHoy.fromMs).getDate(), 14);
  assert.equal(new Date(rangeHoy.fromMs).getHours(), 0);

  const range7d = parseDateRange("ultimos_7_dias", undefined, undefined, now);
  assert.equal(range7d.grouping, "day");
  assert.ok(range7d.toMs > range7d.fromMs);

  const rangeMes = parseDateRange("mes_actual", undefined, undefined, now);
  assert.equal(rangeMes.grouping, "day");
  assert.equal(new Date(rangeMes.fromMs).getDate(), 1);
});

test("parseDateRange falls back to default on invalid dates", () => {
  const range = parseDateRange("custom", "invalid-date", "another-invalid");
  assert.ok(range.fromMs > 0);
  assert.ok(range.toMs >= range.fromMs);
});

test("aggregateTemporal groups by hour correctly", () => {
  const d1 = new Date(2026, 9, 14, 10, 15).getTime();
  const d2 = new Date(2026, 9, 14, 10, 45).getTime();
  const d3 = new Date(2026, 9, 14, 11, 5).getTime();

  const from = new Date(2026, 9, 14, 9, 0).getTime();
  const to = new Date(2026, 9, 14, 12, 0).getTime();

  const res = aggregateTemporal([{ assignedAt: d1 }, { assignedAt: d2 }, { assignedAt: d3 }], "hour", from, to);
  assert.ok(res.length > 0);
  const h10 = res.find((r) => r.label.includes("10:00"));
  assert.equal(h10?.count, 2);
  const h11 = res.find((r) => r.label.includes("11:00"));
  assert.equal(h11?.count, 1);
});

test("aggregateByOperator counts assignments per agent sorted descending", () => {
  const records = [
    { agentId: 1, agentName: "Ana Gómez" },
    { agentId: 2, agentName: "Carlos Pérez" },
    { agentId: 1, agentName: "Ana Gómez" },
    { agentId: 1, agentName: "Ana Gómez" },
  ];
  const res = aggregateByOperator(records);
  assert.equal(res[0].agentName, "Ana Gómez");
  assert.equal(res[0].count, 3);
  assert.equal(res[1].agentName, "Carlos Pérez");
  assert.equal(res[1].count, 1);
});

test("aggregateByType tallies modalities", () => {
  const records = [
    { type: "cyclic" },
    { type: "cyclic" },
    { type: "manual" },
    { type: "batch_suggested" },
  ];
  const res = aggregateByType(records);
  const cyclic = res.find((r) => r.type === "cyclic");
  assert.equal(cyclic?.count, 2);
  const manual = res.find((r) => r.type === "manual");
  assert.equal(manual?.count, 1);
});

test("calculateKpis returns proper aggregates and automation rate", () => {
  const records = [
    { id: 1, agentId: 10, type: "cyclic" },
    { id: 2, agentId: 10, type: "batch_suggested" },
    { id: 3, agentId: 11, type: "manual" },
    { id: 4, agentId: 12, type: "cyclic" },
  ];
  const kpis = calculateKpis(records, 15);
  assert.equal(kpis.totalAsignadas, 4);
  assert.equal(kpis.colaPendiente, 15);
  assert.equal(kpis.operadoresActivos, 3);
  // 3 automatizadas (cyclic + batch_suggested) de 4 = 75%
  assert.equal(kpis.tasaAutomatizacion, 75);
});

test("aggregateInvgateQueue aggregates categories and creators", () => {
  const tickets = [
    { category_last_name: "Contraseñas", creator_name: "Sucursal 101" },
    { category_last_name: "Contraseñas", creator_name: "Sucursal 101" },
    { category_last_name: "VPN", creator_name: "Sucursal 205" },
  ];
  const res = aggregateInvgateQueue(tickets);
  assert.equal(res.byCategory[0].label, "Contraseñas");
  assert.equal(res.byCategory[0].count, 2);
  assert.equal(res.topCreators[0].label, "Sucursal 101");
  assert.equal(res.topCreators[0].count, 2);
});

test("generateCsvExport outputs RFC4180 CSV with headers", () => {
  const records = [
    {
      id: 1,
      ticketNumber: "#12345",
      agentName: "Ana Gómez",
      assignedBy: "Sistema",
      assignedAt: new Date(2026, 9, 14, 10, 0).getTime(),
      type: "cyclic",
    },
  ];
  const csv = generateCsvExport(records);
  assert.ok(csv.includes("ID,Ticket,Operador,Asignado Por,Tipo,Fecha Hora"));
  assert.ok(csv.includes("#12345"));
  assert.ok(csv.includes("Ana Gómez"));
});
