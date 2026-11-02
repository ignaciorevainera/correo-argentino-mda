import test from "node:test";
import assert from "node:assert/strict";
import {
  splitCriteriaByAgent,
  mergeCouncil,
  buildJudgePrompt,
  evaluateWithCouncil,
  type AgentVerdictMap,
} from "./councilEvaluator.js";
import type { AiProvider } from "./types.js";
import type { ExtractedQualityMetadata } from "../qualityMetadataFetcher.js";
import { getAiCriteria } from "../qualityAiEvaluator.js";
import { CHANNEL_TYPES } from "../../types/quality.js";

test("cobertura de buckets: todo criterio de getAiCriteria() para los 3 canales es clasificado por patrones explícitos de Alpha o Beta", () => {
  for (const channel of CHANNEL_TYPES) {
    const criteria = getAiCriteria(channel);
    // splitCriteriaByAgent lanza error explícito si algún criterio no coincide con ALPHA_PATTERNS ni con BETA_PATTERNS
    const { alpha, beta } = splitCriteriaByAgent(criteria);
    assert.ok(alpha.length > 0, `Canal ${channel} debe tener criterios de procesos (Alpha)`);
    assert.ok(beta.length > 0, `Canal ${channel} debe tener criterios de cliente/datos (Beta)`);
    assert.equal(alpha.length + beta.length, criteria.length);

    // Verificar que los códigos asignados a cada agente cumplan exclusivamente con su tipo de responsabilidad
    for (const a of alpha) {
      assert.match(a.code, /(?:categorizacion|tipo|prioridad|sondeo|procedimiento|interpretacion|resolucion)/);
    }
    for (const b of beta) {
      assert.match(b.code, /(?:analisis|seguimiento|exactitud_datos|ortografia|documentacion|info_complementaria|descripcion|redaccion|claridad)/);
    }
  }
});

test("cobertura de buckets con emailThread: todos los criterios de mail son asignados a Alpha o Beta", () => {
  const criteria = getAiCriteria("wise_email", { hasEmailThread: true });
  const { alpha, beta } = splitCriteriaByAgent(criteria);
  assert.equal(alpha.length + beta.length, criteria.length);

  for (const a of alpha) {
    assert.match(a.code, /(?:categorizacion|tipo|prioridad|sondeo|procedimiento|interpretacion|resolucion)/);
  }
  for (const b of beta) {
    assert.match(b.code, /(?:analisis|seguimiento|exactitud_datos|ortografia|documentacion|info_complementaria|descripcion|redaccion|claridad)/);
  }

  const alphaCodes = new Set(alpha.map((c) => c.code));
  const betaCodes = new Set(beta.map((c) => c.code));

  assert.ok(alphaCodes.has("email_interpretacion"));
  assert.ok(alphaCodes.has("email_resolucion"));
  assert.ok(betaCodes.has("email_redaccion"));
  assert.ok(betaCodes.has("email_claridad"));
});

test("cobertura de buckets con audio: todos los criterios telefónicos son asignados a Alpha o Beta", () => {
  const criteria = getAiCriteria("wise_call", { hasAudio: true });
  const { alpha, beta } = splitCriteriaByAgent(criteria);
  assert.equal(alpha.length + beta.length, criteria.length);

  for (const a of alpha) {
    assert.match(a.code, /(?:categorizacion|tipo|prioridad|sondeo|procedimiento|control_conversacion|interes_resolver)/);
  }
  for (const b of beta) {
    assert.match(b.code, /(?:analisis|seguimiento|exactitud_datos|ortografia|documentacion|info_complementaria|descripcion|saludo_estandar|cordialidad|despedida_cordial|lenguaje_apropiado|escucha_activa|contencion_espera)/);
  }
});

test("mergeCouncil: dos null devuelven directo + sin_evidencia conservando min(alpha, beta)", () => {
  const alphaMap: AgentVerdictMap = {
    criterio_a: {
      codigo: "criterio_a",
      cumple: null,
      confianza: 0.9,
      evidencia: "",
      razonamiento: "No hay datos",
    },
  };
  const betaMap: AgentVerdictMap = {
    criterio_a: {
      codigo: "criterio_a",
      cumple: null,
      confianza: 0.8,
      evidencia: "",
      razonamiento: "Sin evidencia",
    },
  };

  const { resolved, disputes } = mergeCouncil(["criterio_a"], alphaMap, betaMap);
  assert.equal(disputes.length, 0);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].codigo, "criterio_a");
  assert.equal(resolved[0].cumple, null);
  assert.equal(resolved[0].confianza, 0.8, "Debe ser min(0.9, 0.8) = 0.8");
  assert.equal(resolved[0].consenso, "directo");
  assert.equal(resolved[0].motivo, "sin_evidencia");
});

test("mergeCouncil: mismo cumple con confianzas >= 0.85 devuelve directo con min(confianza)", () => {
  const alphaMap: AgentVerdictMap = {
    criterio_b: {
      codigo: "criterio_b",
      cumple: true,
      confianza: 0.95,
      evidencia: "Solución aplicada correctamente",
      razonamiento: "Cumple rúbrica",
    },
  };
  const betaMap: AgentVerdictMap = {
    criterio_b: {
      codigo: "criterio_b",
      cumple: true,
      confianza: 0.88,
      evidencia: "Se documentó la solución",
      razonamiento: "El usuario aprobó",
    },
  };

  const { resolved, disputes } = mergeCouncil(["criterio_b"], alphaMap, betaMap);
  assert.equal(disputes.length, 0);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].cumple, true);
  assert.equal(resolved[0].confianza, 0.88);
  assert.equal(resolved[0].consenso, "directo");
  assert.equal(resolved[0].motivo, "acuerdo_alto");
});

test("mergeCouncil: mismo cumple pero confianza < 0.85 pasa a disputa para el Juez", () => {
  const alphaMap: AgentVerdictMap = {
    criterio_c: {
      codigo: "criterio_c",
      cumple: true,
      confianza: 0.9,
      evidencia: "Ok",
      razonamiento: "Bien",
    },
  };
  const betaMap: AgentVerdictMap = {
    criterio_c: {
      codigo: "criterio_c",
      cumple: true,
      confianza: 0.7,
      evidencia: "Dudoso",
      razonamiento: "Falta claridad",
    },
  };

  const { resolved, disputes } = mergeCouncil(["criterio_c"], alphaMap, betaMap);
  assert.equal(resolved.length, 0);
  assert.equal(disputes.length, 1);
  assert.equal(disputes[0].codigo, "criterio_c");
  assert.equal(disputes[0].motivo, "baja_confianza");
});

test("mergeCouncil: veredictos opuestos (true vs false o null vs true) pasan a disputa", () => {
  const alphaMap: AgentVerdictMap = {
    criterio_d: {
      codigo: "criterio_d",
      cumple: true,
      confianza: 0.9,
      evidencia: "Documentado",
      razonamiento: "Explicó los pasos",
    },
  };
  const betaMap: AgentVerdictMap = {
    criterio_d: {
      codigo: "criterio_d",
      cumple: false,
      confianza: 0.85,
      evidencia: "Incompleto",
      razonamiento: "Faltó captura",
    },
  };

  const { resolved, disputes } = mergeCouncil(["criterio_d"], alphaMap, betaMap);
  assert.equal(resolved.length, 0);
  assert.equal(disputes.length, 1);
  assert.equal(disputes[0].codigo, "criterio_d");
  assert.equal(disputes[0].motivo, "discrepancia_cumple");
});

test("mergeCouncil: si un bucket estuvo ausente o falló, se resuelve sin_oposicion sin invocar al juez", () => {
  const alphaMap: AgentVerdictMap = {
    criterio_e: {
      codigo: "criterio_e",
      cumple: true,
      confianza: 0.9,
      evidencia: "Solo Alpha",
      razonamiento: "Solo evaluado por Alpha",
    },
  };
  const betaMap: AgentVerdictMap = {};

  const { resolved, disputes } = mergeCouncil(["criterio_e"], alphaMap, betaMap);
  assert.equal(disputes.length, 0);
  assert.equal(resolved.length, 1);
  assert.ok(
    resolved[0].consenso === "agente_especialista" || resolved[0].consenso === "sin_oposicion",
    "Debe resolverse como especialista sin oposición",
  );
  assert.equal(resolved[0].cumple, true);
});

test("buildJudgePrompt genera un prompt quirúrgico conciso (< 500 tokens por disputa)", () => {
  const prompt = buildJudgePrompt([
    {
      codigo: "call_ticket_procedimiento",
      criterioNombre: "Procedimiento y Derivación",
      rubrica: "Debe derivar a MDA Nivel 2 solo con diagnóstico previo.",
      alphaVote: {
        codigo: "call_ticket_procedimiento",
        cumple: true,
        confianza: 0.85,
        evidencia: "Hizo ping a la IP",
        razonamiento: "Realizó diagnóstico antes de derivar",
      },
      betaVote: {
        codigo: "call_ticket_procedimiento",
        cumple: false,
        confianza: 0.9,
        evidencia: "No adjuntó captura",
        razonamiento: "El procedimiento exige captura de pantalla",
      },
      motivo: "discrepancia_cumple",
    },
  ]);

  assert.ok(prompt.includes("call_ticket_procedimiento"));
  assert.ok(prompt.includes("Postura Agente Alpha"));
  assert.ok(prompt.includes("Postura Agente Beta"));
  assert.ok(prompt.length < 2500); // Conciso (< 500 tokens)
});

test("mergeCouncil: cuando un criterio no tiene voto de ningún agente por caída de bucket (#338), emite veredicto explícito de no_evaluado", () => {
  const alphaMap: AgentVerdictMap = {
    criterio_alpha_ok: {
      codigo: "criterio_alpha_ok",
      cumple: true,
      confianza: 0.9,
      evidencia: "Ok",
      razonamiento: "Evaluado por Alpha",
    },
  };
  // Beta falló totalmente: no tiene veredictos
  const betaMap: AgentVerdictMap = {};

  const allCodes = ["criterio_alpha_ok", "criterio_beta_huerfano"];
  const { resolved, disputes } = mergeCouncil(allCodes, alphaMap, betaMap);

  assert.equal(disputes.length, 0);
  assert.equal(resolved.length, 2, "Debe preservar ambos criterios en resolved");

  const huerfano = resolved.find((r) => r.codigo === "criterio_beta_huerfano");
  assert.ok(huerfano, "El criterio huérfano debe estar presente");
  assert.equal(huerfano.cumple, null, "No debe penalizar con false");
  assert.equal(huerfano.confianza, 0);
  assert.equal(huerfano.consenso, "no_evaluado");
  assert.equal(huerfano.motivo, "agente_fallido");
  assert.match(huerfano.razonamiento, /no evaluado/i);
});

test("evaluateWithCouncil: Escenario 1 - ambos agentes responden OK (#338)", async () => {
  const meta: ExtractedQualityMetadata = {
    caseNumber: "12345",
    operator: "Operador Test",
    date: "2026-10-20",
    title: "Ticket de prueba",
    description: "Problema resuelto",
  };

  const alphaMock: AiProvider = {
    name: "alpha-mock",
    evaluate: async () => JSON.stringify({
      resumen: "Alpha evaluó correctamente.",
      resultados: [
        { codigo: "call_ticket_tipo", cumple: true, confianza: 0.9, evidencia: "Evidencia Alpha", razonamiento: "Ok" },
        { codigo: "call_ticket_prioridad", cumple: true, confianza: 0.9, evidencia: "Evidencia Alpha", razonamiento: "Ok" },
        { codigo: "call_ticket_categorizacion", cumple: true, confianza: 0.9, evidencia: "Evidencia Alpha", razonamiento: "Ok" },
      ],
    }),
  };

  const betaMock: AiProvider = {
    name: "beta-mock",
    evaluate: async () => JSON.stringify({
      resumen: "Beta evaluó correctamente.",
      resultados: [
        { codigo: "call_ticket_descripcion", cumple: true, confianza: 0.85, evidencia: "Evidencia Beta", razonamiento: "Ok" },
        { codigo: "call_ticket_ortografia", cumple: true, confianza: 0.85, evidencia: "Evidencia Beta", razonamiento: "Ok" },
        { codigo: "call_ticket_exactitud_datos", cumple: true, confianza: 0.85, evidencia: "Evidencia Beta", razonamiento: "Ok" },
      ],
    }),
  };

  const result = await evaluateWithCouncil("wise_call", meta, undefined, [], undefined, {
    hasTicket: true,
    alphaProvider: alphaMock,
    betaProvider: betaMock,
  });

  assert.equal(result.isCouncil, true);
  assert.ok(result.verdicts.length > 0);
  assert.doesNotMatch(result.resumen, /ADVERTENCIA/);
});

test("evaluateWithCouncil: Escenario 2 - un agente caído, la evaluación continúa por voto único (#338)", async () => {
  const meta: ExtractedQualityMetadata = {
    caseNumber: "12345",
    operator: "Operador Test",
    date: "2026-10-20",
    title: "Ticket de prueba",
    description: "Problema resuelto",
  };

  const alphaMockFailed: AiProvider = {
    name: "alpha-mock-failed",
    evaluate: async () => {
      throw new Error("Timeout en Agente Alpha");
    },
  };

  const betaMockOk: AiProvider = {
    name: "beta-mock-ok",
    evaluate: async () => JSON.stringify({
      resumen: "Beta evaluó sin problemas.",
      resultados: [
        { codigo: "call_ticket_descripcion", cumple: true, confianza: 0.85, evidencia: "Evidencia Beta", razonamiento: "Ok" },
      ],
    }),
  };

  const result = await evaluateWithCouncil("wise_call", meta, undefined, [], undefined, {
    hasTicket: true,
    alphaProvider: alphaMockFailed,
    betaProvider: betaMockOk,
  });

  assert.equal(result.isCouncil, true);
  const betaVerdict = result.verdicts.find((v) => v.codigo === "call_ticket_descripcion");
  assert.ok(betaVerdict);
  assert.equal(betaVerdict.cumple, true);

  const unevaluated = result.verdicts.filter((v) => result.debate[v.codigo]?.consenso === "no_evaluado");
  assert.ok(unevaluated.length > 0);
  assert.match(result.resumen, /ADVERTENCIA/);
  assert.match(result.resumen, /no fueron evaluados por indisponibilidad/);
});

test("evaluateWithCouncil: Escenario 3 - ambos agentes caídos lanza error (502) (#338)", async () => {
  const meta: ExtractedQualityMetadata = {
    caseNumber: "12345",
    operator: "Operador Test",
    date: "2026-10-20",
    title: "Ticket de prueba",
    description: "Problema",
  };

  const alphaMockFailed: AiProvider = {
    name: "alpha-mock-failed",
    evaluate: async () => {
      throw new Error("Caída de red Alpha");
    },
  };

  const betaMockFailed: AiProvider = {
    name: "beta-mock-failed",
    evaluate: async () => {
      throw new Error("Rate limit 429 Beta");
    },
  };

  await assert.rejects(
    async () => {
      await evaluateWithCouncil("wise_call", meta, undefined, [], undefined, {
        hasTicket: true,
        alphaProvider: alphaMockFailed,
        betaProvider: betaMockFailed,
      });
    },
    /Ambos agentes del Council fallaron al evaluar el caso/
  );
});
