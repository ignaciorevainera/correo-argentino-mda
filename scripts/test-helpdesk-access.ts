import assert from "node:assert/strict";
import { isSectionVisible } from "../src/lib/helpdeskAccess";

// --- MDA TI ---
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "supervisor", "/supervision/cronograma"),
  true,
  "MDA TI + supervisor ve cronograma",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "agent", "/supervision/cronograma"),
  true,
  "MDA TI + agent ve cronograma (solo lectura)",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "agent", "/supervision/calidad-operadores"),
  true,
  "MDA TI + agent ve su calidad (solo la propia)",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "agent", "/supervision/asistencia"),
  false,
  "MDA TI + agent NO ve asistencia",
);
assert.equal(
  isSectionVisible(
    "TI_GSM_MDA TI",
    "agent",
    "/supervision/asignacion-autogestiones",
  ),
  false,
  "MDA TI + agent NO ve AGS",
);
assert.equal(
  isSectionVisible(
    "TI_GSM_MDA TI",
    "referent",
    "/supervision/asignacion-autogestiones",
  ),
  true,
  "MDA TI + referent ve AGS",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "agent", "/inventario-terminales/cubics"),
  true,
  "MDA TI ve la solapa cúbics",
);
assert.equal(
  isSectionVisible("TI_GSM_MDA TI", "admin", "/supervision"),
  true,
  "admin MDA TI ve todo",
);

// --- Mesa de Coord (equivalente a anónimo, sin importar rol) ---
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "supervisor", "/supervision/cronograma"),
  false,
  "Mesa de Coord NO ve cronograma",
);
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "team_leader", "/supervision"),
  false,
  "Mesa de Coord NO ve supervisión",
);
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "admin", "/admin/usuarios"),
  false,
  "Mesa de Coord NO tiene poderes de admin",
);
assert.equal(
  isSectionVisible("TI_GSM_Mesa de Coord", "agent", "/titulos"),
  true,
  "Mesa de Coord ve catálogo común",
);
assert.equal(
  isSectionVisible(
    "TI_GSM_Mesa de Coord",
    "agent",
    "/inventario-terminales/cubics",
  ),
  false,
  "Mesa de Coord NO ve la solapa cúbics",
);

// --- Usuario sin mesa asignada ---
assert.equal(
  isSectionVisible(null, "agent", "/titulos"),
  true,
  "Sin mesa ve catálogo común",
);
assert.equal(
  isSectionVisible(null, "supervisor", "/supervision/cronograma"),
  false,
  "Sin mesa NO ve supervisión",
);

console.log("OK helpdesk-access");
