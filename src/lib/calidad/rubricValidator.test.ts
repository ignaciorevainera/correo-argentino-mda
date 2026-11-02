import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateRubricBlock,
  computeSimpleDiff,
  extractCalibrationMetadata,
  formatCalibrationComment,
  hasCalibrationComment,
  replaceCalibrationComment,
  upsertCalibrationComment,
  normalizeRuleText,
  checkCausalHint,
  insertRuleIntoBlock,
} from "./rubricValidator.js";
import { parseRubricsMap } from "../ai/rubricsLoader.js";

const VALID_SAMPLE_BLOCK = `## criterio: call_ticket_tipo
<!-- calibrado: 2026-10-17 | FP×2 | caso #90123 -->
- **Nombre:** Tipo de solicitud (Llamada Wise)
- **Objetivo:** Verificar que el ticket generado refleje adecuadamente si se trata de un Incidente o Requerimiento.
- **Qué buscar en el ticket:** Comparar el campo type_id contra la descripción del problema informado.
- **Regla Cumple (\`cumple: true\`):** Se clasifica como Incidente ante interrupción o degradación del servicio.
- **Regla No Cumple (\`cumple: false\`):** Se clasifica como Solicitud cuando el servicio está completamente inoperativo.
- **Caso Null (\`cumple: null\`):** Si el canal no permitió tipificar el incidente.
- **Ejemplo Cumple:**
  - Evidencia: "El usuario no puede ingresar al sistema por error de credenciales."
  - Razonamiento: "Problema de acceso tipificado correctamente como incidente según protocolo."
- **Ejemplo No Cumple:**
  - Evidencia: "Servidor caído y se clasificó como requerimiento de nuevo usuario."
  - Razonamiento: "Interrupción total clasificada incorrectamente como solicitud de servicio."`;

describe("rubricValidator - validateRubricBlock", () => {
  it("valida exitosamente un bloque canónico con las 7 claves y cotas de Few-Shot respetadas", () => {
    const res = validateRubricBlock(VALID_SAMPLE_BLOCK, "call_ticket_tipo");
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.parsedMeta?.nombre, "Tipo de solicitud (Llamada Wise)");
    assert.equal(res.parsedMeta?.lastCalibrated, "2026-10-17");
  });

  it("falla si falta alguna de las 7 claves obligatorias del protocolo", () => {
    // Bloque sin 'Regla No Cumple'
    const corruptBlock = VALID_SAMPLE_BLOCK.replace(
      /- \*\*Regla No Cumple \(`cumple: false`\):\*\* [^\n]+/,
      "",
    );
    const res = validateRubricBlock(corruptBlock, "call_ticket_tipo");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Regla No Cumple")));
  });

  it("falla si el delimitador ## criterio: no coincide con el código esperado", () => {
    const res = validateRubricBlock(VALID_SAMPLE_BLOCK, "otro_criterio");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("otro_criterio")));
  });

  it("falla si contiene múltiples delimitadores ## criterio: (riesgo de colisión)", () => {
    const duplicateBlock = `${VALID_SAMPLE_BLOCK}\n\n## criterio: call_ticket_tipo_duplicado\n- **Nombre:** Duplicado`;
    const res = validateRubricBlock(duplicateBlock, "call_ticket_tipo");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("delimitador único")));
  });

  it("falla si la evidencia en un ejemplo Few-Shot supera los 160 caracteres (Z6)", () => {
    const longEvidence = "E".repeat(161);
    const blockWithLongEv = VALID_SAMPLE_BLOCK.replace(
      'Evidencia: "El usuario no puede ingresar al sistema por error de credenciales."',
      `Evidencia: "${longEvidence}"`,
    );
    const res = validateRubricBlock(blockWithLongEv, "call_ticket_tipo");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("160 caracteres")));
  });

  it("falla si el razonamiento en un ejemplo Few-Shot supera los 180 caracteres (Z6)", () => {
    const longReasoning = "R".repeat(181);
    const blockWithLongRe = VALID_SAMPLE_BLOCK.replace(
      'Razonamiento: "Problema de acceso tipificado correctamente como incidente según protocolo."',
      `Razonamiento: "${longReasoning}"`,
    );
    const res = validateRubricBlock(blockWithLongRe, "call_ticket_tipo");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("180 caracteres")));
  });

  it("falla si contiene parches informales prohibidos por el protocolo (Nota, Actualización, Ojo)", () => {
    const patchedBlock = `${VALID_SAMPLE_BLOCK}\n- **Nota:** Excepción agregada por supervisor.`;
    const res = validateRubricBlock(patchedBlock, "call_ticket_tipo");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("parches informales")));
  });
});

describe("rubricValidator - computeSimpleDiff & Kill-Test (Z5)", () => {
  it("reporta hasChanges: false y líneas consistentes ante textos idénticos", () => {
    const diff = computeSimpleDiff(VALID_SAMPLE_BLOCK, VALID_SAMPLE_BLOCK);
    assert.equal(diff.hasChanges, false);
    assert.ok(diff.diffLines.every((l) => l.type === "same"));
    assert.equal(diff.unifiedText, "");
  });

  it("Kill-Test (Z5): modificar una sola línea conserva intactas todas las claves y líneas no editadas", () => {
    const modifiedBlock = VALID_SAMPLE_BLOCK.replace(
      "Se clasifica como Incidente ante interrupción o degradación del servicio.",
      "SI ocurre falla masiva PERO el servicio responde, ENTONCES clasificar como degradación leve.",
    );

    const diff = computeSimpleDiff(VALID_SAMPLE_BLOCK, modifiedBlock);
    assert.equal(diff.hasChanges, true);

    const deletedLines = diff.diffLines.filter((l) => l.type === "del");
    const addedLines = diff.diffLines.filter((l) => l.type === "add");
    const sameLines = diff.diffLines.filter((l) => l.type === "same");

    // Exactamente 1 línea eliminada y 1 línea añadida
    assert.equal(deletedLines.length, 1);
    assert.equal(addedLines.length, 1);
    assert.ok(deletedLines[0].line.includes("Se clasifica como Incidente"));
    assert.ok(addedLines[0].line.includes("SI ocurre falla masiva PERO"));

    // Claves no editadas permanecen intactas en las líneas 'same'
    const sameJoined = sameLines.map((l) => l.line).join("\n");
    assert.ok(sameJoined.includes("- **Nombre:** Tipo de solicitud (Llamada Wise)"));
    assert.ok(sameJoined.includes("- **Objetivo:**"));
    assert.ok(sameJoined.includes("- **Qué buscar en el ticket:**"));
    assert.ok(sameJoined.includes("- **Regla No Cumple"));
    assert.ok(sameJoined.includes("- **Ejemplo Cumple:**"));
    assert.ok(sameJoined.includes("- **Ejemplo No Cumple:**"));

    // El diff unificado incluye los marcadores +/- legibles
    assert.ok(diff.unifiedText.includes("- - **Regla Cumple (`cumple: true`):** Se clasifica"));
    assert.ok(diff.unifiedText.includes("+ - **Regla Cumple (`cumple: true`):** SI ocurre"));
  });
});

describe("rubricValidator - extractCalibrationMetadata & formatCalibrationComment (W2)", () => {
  it("formatea el comentario de calibración canónico sin romper la gramática", () => {
    const comment = formatCalibrationComment("2026-10-17", "FP×3", "84920");
    assert.equal(comment, "<!-- calibrado: 2026-10-17 | FP×3 | caso #84920 -->");
  });

  it("extrae la fecha y metadatos de calibración de un bloque con comentario HTML", () => {
    const meta = extractCalibrationMetadata(VALID_SAMPLE_BLOCK);
    assert.ok(meta);
    assert.equal(meta.date, "2026-10-17");
    assert.equal(meta.info, "FP×2 | caso #90123");
  });

  it("retorna null si el bloque no tiene comentario de calibración", () => {
    const cleanBlock = VALID_SAMPLE_BLOCK.replace(/<!--.*?-->\n?/g, "");
    const meta = extractCalibrationMetadata(cleanBlock);
    assert.equal(meta, null);
  });

  it("extrae metadatos correctamente aún cuando info contiene guiones (ej. caso #ticket-123 o falso-positivo) (#370/MEDIO 5)", () => {
    const blockWithHyphens = `## criterio: call_ticket_tipo
<!-- calibrado: 2026-10-18 | falso-positivo | caso #ticket-98765-ext -->
- **Nombre:** Test`;
    const meta = extractCalibrationMetadata(blockWithHyphens);
    assert.ok(meta, "Debe extraer metadatos sin fallar por guiones");
    assert.equal(meta.date, "2026-10-18");
    assert.equal(meta.info, "falso-positivo | caso #ticket-98765-ext");
    assert.equal(meta.raw, "<!-- calibrado: 2026-10-18 | falso-positivo | caso #ticket-98765-ext -->");
  });
});

describe("rubricValidator - normalizeRuleText & checkCausalHint", () => {
  it("normaliza texto quitando viñetas iniciales y colapsando espacios y saltos", () => {
    const raw = "  -   SI ocurre [X]\n   PERO ocurre [Y],\n   ENTONCES cumple: false.  ";
    const norm = normalizeRuleText(raw);
    assert.equal(norm, "SI ocurre [X] PERO ocurre [Y], ENTONCES cumple: false.");
  });

  it("checkCausalHint detecta estructura causal y emite hint orientativo si falta", () => {
    const withCausal = checkCausalHint("SI falla el enlace PERO hay backup, ENTONCES aprobar.");
    assert.equal(withCausal.isCausal, true);
    assert.equal(withCausal.hint, undefined);

    const withoutCausal = checkCausalHint("Regla informal sin estructura.");
    assert.equal(withoutCausal.isCausal, false);
    assert.ok(withoutCausal.hint?.includes("SI [condición] PERO [salvedad], ENTONCES"));
  });
});

describe("rubricValidator - insertRuleIntoBlock (No-destructivo byte a byte)", () => {
  it("inserta en sección inline promoviendo a viñetas múltiples y preservando texto previo byte a byte", () => {
    const res = insertRuleIntoBlock(
      VALID_SAMPLE_BLOCK,
      "SI el sistema no permite tipificar pero se documentó en notas, ENTONCES cumple: true.",
      "cumple",
      "call_ticket_tipo",
    );

    assert.equal(res.success, true);
    assert.equal(res.errors.length, 0);

    // Texto preexistente exacto byte a byte
    const originalText = "Se clasifica como Incidente ante interrupción o degradación del servicio.";
    assert.ok(
      res.newBlock.includes(originalText),
      `Se esperaba preservar byte a byte el texto preexistente: "${originalText}"`,
    );

    // Nueva regla inyectada
    assert.ok(
      res.newBlock.includes(
        "  - SI el sistema no permite tipificar pero se documentó en notas, ENTONCES cumple: true.",
      ),
    );

    // Validez de las 7 claves canónicas intacta
    const val = validateRubricBlock(res.newBlock, "call_ticket_tipo");
    assert.equal(val.valid, true);
  });

  it("inserta en sección que ya tiene múltiples viñetas preservando cada una byte a byte", () => {
    const MULTI_BULLET_BLOCK = `## criterio: call_ticket_exactitud_datos
- **Nombre:** Exactitud en el ingreso de datos (Llamada Wise)
- **Objetivo:** Constatar que todos los campos del ticket sean verídicos y consistentes.
- **Qué buscar en el ticket:** Cotejar Solicitante, Descripción y custom_fields.
- **Regla Cumple (\`cumple: true\`):** Solicitante real y datos consistentes.
- **Regla No Cumple (\`cumple: false\`):**
  - Se completó un campo obligatorio con datos ficticios (ej: 11111, 0000).
  - Se asignó el ticket a un usuario genérico.
- **Ejemplo Cumple:**
  - Evidencia: "Solicitante verificado y teléfono asentado."
  - Razonamiento: "Cumple con exactitud de datos."
- **Ejemplo No Cumple:**
  - Evidencia: "Teléfono 11111 asentado en formulario."
  - Razonamiento: "Dato ficticio ingresado para sortear validación."`;

    const bullet1 = "  - Se completó un campo obligatorio con datos ficticios (ej: 11111, 0000).";
    const bullet2 = "  - Se asignó el ticket a un usuario genérico.";

    const res = insertRuleIntoBlock(
      MULTI_BULLET_BLOCK,
      "SI aparece [object Object] tras cambio de categoría, PERO la gestión fue correcta, ENTONCES NO penalizar.",
      "no_cumple",
      "call_ticket_exactitud_datos",
    );

    assert.equal(res.success, true);
    assert.equal(res.errors.length, 0);

    // Preservación byte a byte de las viñetas anteriores
    assert.ok(
      res.newBlock.includes(bullet1),
      "La viñeta 1 de datos ficticios debe conservarse byte a byte.",
    );
    assert.ok(
      res.newBlock.includes(bullet2),
      "La viñeta 2 de usuario genérico debe conservarse byte a byte.",
    );

    // Nueva viñeta añadida al final del grupo
    assert.ok(
      res.newBlock.includes(
        "  - SI aparece [object Object] tras cambio de categoría, PERO la gestión fue correcta, ENTONCES NO penalizar.",
      ),
    );

    // El orden relativo se conserva (bullet 1 antes de bullet 2 antes de la nueva viñeta)
    const idxB1 = res.newBlock.indexOf(bullet1);
    const idxB2 = res.newBlock.indexOf(bullet2);
    const idxNew = res.newBlock.indexOf("[object Object]");
    assert.ok(idxB1 < idxB2, "Bullet 1 debe preceder a Bullet 2");
    assert.ok(idxB2 < idxNew, "Bullet 2 debe preceder a la nueva viñeta agregada");

    // Validez de 7 claves canónicas
    const val = validateRubricBlock(res.newBlock, "call_ticket_exactitud_datos");
    assert.equal(val.valid, true);
  });

  it("aborta y retorna error si la regla está vacía sin mutar el bloque", () => {
    const res = insertRuleIntoBlock(VALID_SAMPLE_BLOCK, "   -   ", "no_cumple", "call_ticket_tipo");
    assert.equal(res.success, false);
    assert.equal(res.newBlock, VALID_SAMPLE_BLOCK);
    assert.ok(res.errors[0].includes("vacío"));
  });
});

describe("rubricValidator - hasCalibrationComment, replaceCalibrationComment y upsertCalibrationComment (#370)", () => {
  const blockWithCanonicalComment = `## criterio: call_ticket_tipo
<!-- calibrado: 2026-10-17 | FP×2 | caso #90123 -->
- **Nombre:** Tipo de solicitud (Llamada Wise)`;

  const blockWithoutComment = `## criterio: call_ticket_tipo
- **Nombre:** Tipo de solicitud (Llamada Wise)`;

  it("hasCalibrationComment reconoce el comentario canónico con fecha ISO y guiones", () => {
    assert.equal(hasCalibrationComment(blockWithCanonicalComment), true);
    assert.equal(hasCalibrationComment(blockWithoutComment), false);
  });

  it("replaceCalibrationComment reemplaza el comentario canónico completo por uno nuevo", () => {
    const updated = replaceCalibrationComment(
      blockWithCanonicalComment,
      "<!-- calibrado: 2026-10-20 | Falso Positivo | caso #99999 -->",
    );
    assert.ok(updated.includes("<!-- calibrado: 2026-10-20 | Falso Positivo | caso #99999 -->"));
    assert.ok(!updated.includes("2026-10-17"));
    assert.ok(!updated.includes("90123"));
  });

  it("upsertCalibrationComment actualiza el comentario existente o lo inyecta bajo el encabezado de criterio", () => {
    const newComment = "<!-- calibrado: 2026-10-20 | Calibración | caso #12345 -->";

    // Caso 1: ya tiene comentario
    const updated1 = upsertCalibrationComment(blockWithCanonicalComment, "call_ticket_tipo", newComment);
    assert.ok(updated1.includes(newComment));
    assert.ok(!updated1.includes("2026-10-17"));

    // Caso 2: no tiene comentario
    const updated2 = upsertCalibrationComment(blockWithoutComment, "call_ticket_tipo", newComment);
    assert.ok(updated2.includes(`## criterio: call_ticket_tipo\n${newComment}\n`));
  });
});

describe("rubricValidator - Contrato de rúbricas del archivo rubricas-calidad.md", () => {
  it("todos los bloques definidos en rubricas-calidad.md deben cumplir estrictamente el protocolo de 7 claves", () => {
    const rubricsMap = parseRubricsMap();
    assert.ok(rubricsMap.size > 0, "El mapa de rúbricas no debe estar vacío");

    const failures: Array<{ code: string; errors: string[] }> = [];

    for (const [code, block] of rubricsMap.entries()) {
      const result = validateRubricBlock(block, code);
      if (!result.valid) {
        failures.push({ code, errors: result.errors });
      }
    }

    if (failures.length > 0) {
      const summary = failures
        .map((f) => `  - [${f.code}]: ${f.errors.join("; ")}`)
        .join("\n");
      assert.fail(`Se encontraron ${failures.length} bloques de rúbrica con errores de contrato:\n${summary}`);
    }
  });
});

