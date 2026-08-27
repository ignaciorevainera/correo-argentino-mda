import assert from "node:assert/strict";
import { isSectionVisible } from "../src/lib/helpdeskAccess";

assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "supervisor", "/supervision/cronograma"),
  true,
  "MDA TI + supervisor ve cronograma",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "agent", "/supervision/cronograma"),
  false,
  "MDA TI + agent NO ve cronograma",
);
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "supervisor", "/supervision/cronograma"),
  false,
  "Mesa de Coord + supervisor NO ve cronograma",
);
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "team_leader", "/supervision"),
  false,
  "Mesa de Coord + team_leader NO ve supervisión",
);
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "agent", "/titulos"),
  true,
  "Mesa de Coord ve catálogo común",
);
assert.equal(
  isSectionVisible("Default", "agent", "/titulos"),
  true,
  "Default ve catálogo común",
);
assert.equal(
  isSectionVisible(null, "agent", "/titulos"),
  true,
  "Usuario no autenticado ve catálogo común",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "admin", "/supervision"),
  true,
  "admin ve todo",
);

console.log("OK helpdesk-access");
