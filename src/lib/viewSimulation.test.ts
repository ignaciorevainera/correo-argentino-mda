import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getViewProfile,
  resolveViewAs,
  VIEW_PROFILES,
} from "./viewSimulation";

test("la lista blanca expone los tres perfiles vigentes", () => {
  assert.deepEqual(
    VIEW_PROFILES.map((profile) => profile.id),
    ["operador", "referente", "supervisor"],
  );
});

test("getViewProfile ignora ids desconocidos o vacíos", () => {
  assert.equal(getViewProfile("operador")?.label, "Operador");
  assert.equal(getViewProfile("referente")?.label, "Referente");
  assert.equal(getViewProfile("admin"), null);
  // Valores retirados del simulador: ya no se aceptan.
  assert.equal(getViewProfile("calidad"), null);
  assert.equal(getViewProfile("team_leader"), null);
  assert.equal(getViewProfile(""), null);
  assert.equal(getViewProfile(null), null);
  assert.equal(getViewProfile("constructor"), null);
});

test("sólo un admin real puede simular (fail-closed)", () => {
  assert.equal(resolveViewAs("admin", "operador")?.id, "operador");
  assert.equal(resolveViewAs(" Admin ", "supervisor")?.id, "supervisor");
  assert.equal(resolveViewAs("supervisor", "operador"), null);
  assert.equal(resolveViewAs("referent", "referente"), null);
  assert.equal(resolveViewAs(null, "operador"), null);
  assert.equal(resolveViewAs("admin", "no-existe"), null);
});

test("cada perfil mapea a un rol y a un perfil de home válidos", () => {
  const byId = Object.fromEntries(
    VIEW_PROFILES.map((profile) => [profile.id, profile]),
  );
  assert.equal(byId.operador.role, "agent");
  assert.equal(byId.operador.homeProfile, "operador");
  assert.equal(byId.referente.role, "referent");
  assert.equal(byId.referente.homeProfile, "referente");
  assert.equal(byId.supervisor.role, "supervisor");
  assert.equal(byId.supervisor.homeProfile, "supervisor");
});
