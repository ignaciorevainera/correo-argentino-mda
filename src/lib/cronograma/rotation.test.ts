import { test } from "node:test";
import assert from "node:assert/strict";
import { isSaturdayRotationActive } from "./rotation";

// Config de referencia: arranca el sábado 2026-06-06 con el grupo A y rota
// semanalmente A → B → C → D.
const config = {
  rotationOrder: "A,B,C,D",
  startDate: "2026-06-06",
  startGroup: "A",
  disabledGroups: "",
};

test("el grupo de la semana de arranque toma el sábado", () => {
  assert.equal(isSaturdayRotationActive(config, "A", "2026-06-06"), true);
  assert.equal(isSaturdayRotationActive(config, "B", "2026-06-06"), false);
});

test("la rotación avanza una posición por semana", () => {
  assert.equal(isSaturdayRotationActive(config, "B", "2026-06-13"), true);
  assert.equal(isSaturdayRotationActive(config, "C", "2026-06-20"), true);
  assert.equal(isSaturdayRotationActive(config, "D", "2026-06-27"), true);
  // Vuelve al inicio a las 4 semanas.
  assert.equal(isSaturdayRotationActive(config, "A", "2026-07-04"), true);
});

test("una fecha anterior al inicio de la rotación cicla hacia atrás", () => {
  assert.equal(isSaturdayRotationActive(config, "D", "2026-05-30"), true);
});

test("solo aplica a sábados", () => {
  assert.equal(isSaturdayRotationActive(config, "A", "2026-06-10"), false);
  assert.equal(isSaturdayRotationActive(config, "A", "2026-06-07"), false);
});

test("un grupo deshabilitado no rota aunque le toque la semana", () => {
  assert.equal(
    isSaturdayRotationActive(
      { ...config, disabledGroups: "A,C" },
      "A",
      "2026-06-06",
    ),
    false,
  );
  assert.equal(
    isSaturdayRotationActive(
      { ...config, disabledGroups: "B" },
      "A",
      "2026-06-06",
    ),
    true,
  );
});

test("sin grupo, sin config o con orden vacío no hay rotación", () => {
  assert.equal(isSaturdayRotationActive(config, null, "2026-06-06"), false);
  assert.equal(isSaturdayRotationActive(config, "", "2026-06-06"), false);
  assert.equal(isSaturdayRotationActive(null, "A", "2026-06-06"), false);
  assert.equal(
    isSaturdayRotationActive({ ...config, rotationOrder: "" }, "A", "2026-06-06"),
    false,
  );
});

test("un startGroup desconocido cae en la primera posición del orden", () => {
  assert.equal(
    isSaturdayRotationActive(
      { ...config, startGroup: "ZZ" },
      "A",
      "2026-06-06",
    ),
    true,
  );
});
