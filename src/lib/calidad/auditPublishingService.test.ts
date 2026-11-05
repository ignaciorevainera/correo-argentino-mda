import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePublishPermission,
  buildPublishAuditPayload,
  buildBatchPublishConditions,
} from "./auditPublishingService.js";

test("validatePublishPermission permite a supervisor y admin, rechaza otros", () => {
  assert.equal(validatePublishPermission("admin").allowed, true);
  assert.equal(validatePublishPermission("supervisor").allowed, true);
  assert.equal(validatePublishPermission("team_leader").allowed, false);
  assert.equal(validatePublishPermission("referent").allowed, false);
  assert.equal(validatePublishPermission("agent").allowed, false);
  assert.equal(validatePublishPermission(undefined).allowed, false);
});

test("buildPublishAuditPayload retorna el payload exacto de publicación", () => {
  const payload = buildPublishAuditPayload();
  assert.deepEqual(payload, { status: "published" });
});

test("buildBatchPublishConditions valida parámetros y genera criterios claros", () => {
  // Caso 1: Array de IDs explícitos
  const byIds = buildBatchPublishConditions({ auditIds: [10, 20, 30] });
  assert.equal(byIds.valid, true);
  assert.equal(byIds.type, "ids");
  assert.deepEqual(byIds.auditIds, [10, 20, 30]);

  // Caso 2: Por agente y mes
  const byAgentMonth = buildBatchPublishConditions({ agentId: 5, month: "2026-11" });
  assert.equal(byAgentMonth.valid, true);
  assert.equal(byAgentMonth.type, "agent_month");
  assert.equal(byAgentMonth.agentId, 5);
  assert.equal(byAgentMonth.month, "2026-11");

  // Caso 3: Inválido si no tiene ni IDs ni agentId+month
  const invalidEmpty = buildBatchPublishConditions({});
  assert.equal(invalidEmpty.valid, false);
  assert.ok(invalidEmpty.error);

  const invalidPartial = buildBatchPublishConditions({ month: "2026-11" });
  assert.equal(invalidPartial.valid, false);
});
