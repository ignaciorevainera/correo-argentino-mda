import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHomeProfile } from "./homeProfile";

const agent = (overrides: { enCronograma?: boolean; incluidoCalidad?: boolean } = {}) => ({
  enCronograma: overrides.enCronograma ?? false,
  incluidoCalidad: overrides.incluidoCalidad ?? false,
});

test("admin y supervisor tienen perfil propio sin importar el agente", () => {
  assert.equal(
    resolveHomeProfile({ role: "admin", agent: agent({ enCronograma: true }) }),
    "admin",
  );
  assert.equal(
    resolveHomeProfile({ role: "supervisor", agent: agent({ enCronograma: true }) }),
    "supervisor",
  );
});

test("agente con calidad y sin cronograma usa el perfil de calidad", () => {
  assert.equal(
    resolveHomeProfile({
      role: "agent",
      agent: agent({ incluidoCalidad: true, enCronograma: false }),
    }),
    "calidad",
  );
});

test("agente en cronograma usa el perfil de operador; referente tiene el suyo", () => {
  assert.equal(
    resolveHomeProfile({ role: "agent", agent: agent({ enCronograma: true }) }),
    "operador",
  );
  assert.equal(
    resolveHomeProfile({ role: "referent", agent: agent({ enCronograma: true }) }),
    "referente",
  );
  assert.equal(
    resolveHomeProfile({ role: "referent", agent: null }),
    "referente",
  );
  assert.equal(
    resolveHomeProfile({ role: "team_leader", agent: agent({ enCronograma: true }) }),
    "operador",
  );
  // Si tiene las dos participaciones, pesa el cronograma.
  assert.equal(
    resolveHomeProfile({
      role: "agent",
      agent: agent({ enCronograma: true, incluidoCalidad: true }),
    }),
    "operador",
  );
});

test("sin agente, o con agente sin participaciones, el perfil es base", () => {
  assert.equal(resolveHomeProfile({ role: "agent", agent: null }), "base");
  assert.equal(resolveHomeProfile({ role: "agent", agent: agent() }), "base");
  assert.equal(resolveHomeProfile({ role: null, agent: null }), "base");
});

test("el rol se normaliza (mayúsculas y espacios)", () => {
  assert.equal(
    resolveHomeProfile({ role: " Supervisor ", agent: null }),
    "supervisor",
  );
});
