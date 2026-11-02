import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCommitsStats,
  estimateWorkHoursFromTimestamps,
  parseNumstatOutput,
} from "./changelogStats.js";

test("changelogStats - parseNumstatOutput", async (t) => {
  await t.test("parsea adiciones y eliminaciones estándar", () => {
    const raw = `10\t5\tsrc/index.ts\n20\t0\tsrc/utils.ts\n0\t8\tdocs/readme.md`;
    const res = parseNumstatOutput(raw);
    assert.deepEqual(res, { additions: 30, deletions: 13 });
  });

  await t.test("ignora archivos binarios con guion (- - file)", () => {
    const raw = `-\t-\tpublic/image.png\n15\t3\tsrc/file.ts`;
    const res = parseNumstatOutput(raw);
    assert.deepEqual(res, { additions: 15, deletions: 3 });
  });

  await t.test("maneja cadenas vacías o con espacios en blanco limpiamente", () => {
    const res = parseNumstatOutput("   \n\n  ");
    assert.deepEqual(res, { additions: 0, deletions: 0 });
  });
});

test("changelogStats - estimateWorkHoursFromTimestamps", async (t) => {
  await t.test("devuelve 0 si la lista de timestamps está vacía", () => {
    const res = estimateWorkHoursFromTimestamps([]);
    assert.equal(res.estimatedHours, 0);
    assert.equal(res.formattedHours, "0.0 h");
  });

  await t.test("un commit único/aislado cuenta con tiempo base de 30 minutos (0.5 h)", () => {
    const t0 = 1700000000;
    const res = estimateWorkHoursFromTimestamps([t0]);
    assert.equal(res.estimatedHours, 0.5);
    assert.equal(res.formattedHours, "0.5 h");
  });

  await t.test("dos commits dentro de la misma sesión (<= 2h de diferencia) suman delta_t + tiempo base", () => {
    const t0 = 1700000000;
    // 45 minutos después (2700 seg)
    const t1 = t0 + 2700;
    // Base 0.5h (30m) + 45m = 75m = 1.25h -> 1.3 h
    const res = estimateWorkHoursFromTimestamps([t0, t1]);
    assert.equal(res.estimatedHours, 1.3);
    assert.equal(res.formattedHours, "1.3 h");
  });

  await t.test("commits separados por más de 2h inician sesiones independientes con base de 30m cada una", () => {
    const t0 = 1700000000;
    // Commit 1: sesión 1 (30m)
    // Commit 2: 3 horas después (10800 seg) -> inicia sesión 2 (30m)
    const t1 = t0 + 10800;
    // Total = 0.5h + 0.5h = 1.0 h
    const res = estimateWorkHoursFromTimestamps([t0, t1]);
    assert.equal(res.estimatedHours, 1.0);
    assert.equal(res.formattedHours, "1.0 h");
  });

  await t.test("ordena timestamps cronológicamente sin importar el orden de entrada", () => {
    const t0 = 1700000000;
    const t1 = t0 + 3600; // 1 hora después
    const res = estimateWorkHoursFromTimestamps([t1, t0]);
    // 30m base + 60m delta = 90m = 1.5 h
    assert.equal(res.estimatedHours, 1.5);
    assert.equal(res.formattedHours, "1.5 h");
  });
});

test("changelogStats - calculateCommitsStats con git real o fallback seguro", async (t) => {
  await t.test("retorna stats en cero ante lista vacía o hashes inexistentes", () => {
    const res = calculateCommitsStats(["invalido123", "0000000"]);
    assert.equal(res.additions, 0);
    assert.equal(res.deletions, 0);
    assert.equal(res.estimatedHours, 0);
  });

  await t.test("calcula métricas reales de commits existentes en el repositorio local", () => {
    // Commit conocido en git del historial reciente
    const res = calculateCommitsStats(["8e7b2a1d"]);
    assert.ok(res.additions > 0, "Debe tener líneas agregadas");
    assert.ok(res.estimatedHours >= 0.5, "Debe estimar al menos 0.5 h");
  });
});
