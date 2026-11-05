import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidAuditStatus,
  filterAuditsForOperator,
  filterAuditsForSupervisor,
  countPendingDrafts,
  canPublishAudit,
  QUALITY_AUDIT_STATUSES,
} from "./auditLifecycle.js";

test("QUALITY_AUDIT_STATUSES contiene exactamente 'draft' y 'published'", () => {
  assert.deepEqual(QUALITY_AUDIT_STATUSES, ["draft", "published"]);
});

test("isValidAuditStatus valida correctamente estados permitidos y rechaza inválidos", () => {
  assert.equal(isValidAuditStatus("draft"), true);
  assert.equal(isValidAuditStatus("published"), true);
  assert.equal(isValidAuditStatus("pending"), false);
  assert.equal(isValidAuditStatus(""), false);
  assert.equal(isValidAuditStatus(null), false);
  assert.equal(isValidAuditStatus(undefined), false);
  assert.equal(isValidAuditStatus(123), false);
});

test("filterAuditsForOperator solo devuelve auditorías en estado 'published'", () => {
  const sampleAudits = [
    { id: 1, totalScore: 90, status: "draft" },
    { id: 2, totalScore: 85, status: "published" },
    { id: 3, totalScore: 70, status: null }, // default histórico sin migrar se trata como no publicado para operador
    { id: 4, totalScore: 95, status: "published" },
  ];

  const filtered = filterAuditsForOperator(sampleAudits);
  assert.equal(filtered.length, 2);
  assert.deepEqual(filtered.map(a => a.id), [2, 4]);
  assert.ok(filtered.every(a => a.status === "published"));
});

test("filterAuditsForSupervisor permite ver todas o filtrar por estado", () => {
  const sampleAudits = [
    { id: 1, status: "draft" },
    { id: 2, status: "published" },
    { id: 3, status: "draft" },
  ];

  // Por defecto o 'all', devuelve todas
  assert.equal(filterAuditsForSupervisor(sampleAudits).length, 3);
  assert.equal(filterAuditsForSupervisor(sampleAudits, "all").length, 3);

  // Solo borradores
  const drafts = filterAuditsForSupervisor(sampleAudits, "draft");
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map(a => a.id), [1, 3]);

  // Solo publicadas
  const published = filterAuditsForSupervisor(sampleAudits, "published");
  assert.equal(published.length, 1);
  assert.equal(published[0].id, 2);
});

test("countPendingDrafts calcula la cantidad exacta de borradores", () => {
  assert.equal(countPendingDrafts([]), 0);
  assert.equal(countPendingDrafts([
    { status: "draft" },
    { status: "published" },
    { status: "draft" },
  ]), 2);
  assert.equal(countPendingDrafts([{ status: "published" }]), 0);
});

test("canPublishAudit solo autoriza roles de supervisión y administración", () => {
  assert.equal(canPublishAudit("admin"), true);
  assert.equal(canPublishAudit("supervisor"), true);
  assert.equal(canPublishAudit("team_leader"), false);
  assert.equal(canPublishAudit("referent"), false);
  assert.equal(canPublishAudit("agent"), false);
  assert.equal(canPublishAudit(""), false);
});
