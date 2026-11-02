import type { ChannelType } from "@/types/quality";
import type { ExtractedQualityMetadata } from "@/lib/qualityMetadataFetcher";
import {
  type AiCriterion,
  getAiCriteria,
  buildTicketContext,
  buildPrompt,
  parseVerdicts,
  AiBusyError,
  acquireAiSlot,
  releaseAiSlot,
} from "@/lib/qualityAiEvaluator";
import { getRubricsForCriteria } from "@/lib/ai/rubricsLoader";
import { OpenCodeProvider } from "@/lib/ai/opencodeProvider";
import { fetchInvgateTicketTimeline, type InvgateTimelineEntry } from "@/lib/invgate/timelineScraper";
import type {
  AiProvider,
  AiVerdict,
  CouncilVote,
  CouncilDebateEntry,
  CouncilEvaluationResult,
} from "./types.js";

export type AgentVerdictMap = Record<string, AiVerdict>;

export const ALPHA_MODEL = "opencode/deepseek-v4.1-flash-free";
export const BETA_MODEL = "opencode/mimo-v2.6-flash-free";
export const JUDGE_MODEL = "opencode/nemotron-3.5-lightning-free";

/**
 * Patrones para dividir los criterios entre Agente Alpha (Procesos) y Beta (Cliente/Ortografía).
 * Nota: 'descripcion' se asigna explícitamente a Beta para evitar que quede huérfano.
 */
const ALPHA_PATTERNS = [
  /categorizacion_final$/,
  /categorizacion$/,
  /correccion_tipo$|_tipo$/,
  /correccion_prioridad$|_prioridad$/,
  /sondeo$/,
  /procedimiento$/,
  /control_conversacion$/,
  /interes_resolver$/,
  /interpretacion$/,
  /resolucion$/,
];

const BETA_PATTERNS = [
  /analisis$/,
  /seguimiento$/,
  /exactitud_datos$/,
  /ortografia$/,
  /documentacion$/,
  /info_complementaria$/,
  /descripcion$/,
  /saludo_estandar$/,
  /cordialidad$/,
  /despedida_cordial$/,
  /lenguaje_apropiado$/,
  /escucha_activa$/,
  /contencion_espera$/,
  /redaccion$/,
  /claridad$/,
];

export function isAlphaCriterion(code: string): boolean {
  return ALPHA_PATTERNS.some((re) => re.test(code));
}

export function isBetaCriterion(code: string): boolean {
  return BETA_PATTERNS.some((re) => re.test(code));
}

export function splitCriteriaByAgent(criteria: AiCriterion[]): {
  alpha: AiCriterion[];
  beta: AiCriterion[];
} {
  const alpha: AiCriterion[] = [];
  const beta: AiCriterion[] = [];

  for (const c of criteria) {
    if (isAlphaCriterion(c.code)) {
      alpha.push(c);
    } else if (isBetaCriterion(c.code)) {
      beta.push(c);
    } else {
      throw new Error(`Criterio no asignado a ningún agente del Council: ${c.code}`);
    }
  }

  return { alpha, beta };
}

export interface DisputeItem {
  codigo: string;
  criterioNombre: string;
  rubrica: string;
  alphaVote?: AiVerdict;
  betaVote?: AiVerdict;
  motivo: "baja_confianza" | "discrepancia_cumple";
}

export interface MergedCouncilOutput {
  resolved: Array<AiVerdict & { consenso: CouncilDebateEntry["consenso"]; motivo?: CouncilDebateEntry["motivo"] }>;
  disputes: DisputeItem[];
}

export function mergeCouncil(
  codes: string[],
  alphaMap: AgentVerdictMap,
  betaMap: AgentVerdictMap,
  criteriaMetadata?: Record<string, { name: string; rubrica: string }>,
): MergedCouncilOutput {
  const resolved: MergedCouncilOutput["resolved"] = [];
  const disputes: DisputeItem[] = [];

  for (const code of codes) {
    const alphaVote = alphaMap[code];
    const betaVote = betaMap[code];
    const meta = criteriaMetadata?.[code] ?? { name: code, rubrica: "" };

    // Si solo uno de los dos agentes tiene veredicto (por split o fallo del otro)
    if (!alphaVote || !betaVote) {
      const soleVote = alphaVote || betaVote;
      if (soleVote) {
        resolved.push({
          ...soleVote,
          consenso: "agente_especialista",
          motivo: "agente_unico",
        });
      } else {
        // Ningún agente devolvió veredicto para este criterio (ej: caída del agente asignado al bucket)
        resolved.push({
          codigo: code,
          cumple: null,
          confianza: 0,
          evidencia: "",
          razonamiento: "No evaluado: el agente especialista asignado no completó la evaluación.",
          consenso: "no_evaluado",
          motivo: "agente_fallido",
        });
      }
      continue;
    }

    // Caso 1: Ambos devuelven null (sin evidencia)
    if (alphaVote.cumple === null && betaVote.cumple === null) {
      const minConf = Math.min(alphaVote.confianza, betaVote.confianza);
      resolved.push({
        codigo: code,
        cumple: null,
        confianza: minConf,
        evidencia: alphaVote.evidencia || betaVote.evidencia || "",
        razonamiento: alphaVote.razonamiento || betaVote.razonamiento || "Sin evidencia suficiente en el ticket.",
        consenso: "directo",
        motivo: "sin_evidencia",
      });
      continue;
    }

    // Caso 2: Mismo veredicto de cumplimiento
    if (alphaVote.cumple === betaVote.cumple) {
      const minConf = Math.min(alphaVote.confianza, betaVote.confianza);
      if (minConf >= 0.85) {
        // Acuerdo alto
        resolved.push({
          codigo: code,
          cumple: alphaVote.cumple,
          confianza: minConf,
          evidencia: alphaVote.evidencia || betaVote.evidencia,
          razonamiento: alphaVote.razonamiento || betaVote.razonamiento,
          consenso: "directo",
          motivo: "acuerdo_alto",
        });
        continue;
      }

      // Mismo veredicto pero confianza baja (< 0.85) -> requiere juez
      disputes.push({
        codigo: code,
        criterioNombre: meta.name,
        rubrica: meta.rubrica,
        alphaVote,
        betaVote,
        motivo: "baja_confianza",
      });
      continue;
    }

    // Caso 3: Veredictos opuestos (true vs false o null vs true/false)
    disputes.push({
      codigo: code,
      criterioNombre: meta.name,
      rubrica: meta.rubrica,
      alphaVote,
      betaVote,
      motivo: "discrepancia_cumple",
    });
  }

  return { resolved, disputes };
}

export function buildJudgePrompt(disputes: DisputeItem[]): string {
  const disputesBlocks = disputes.map((d, index) => {
    return [
      `### Disputa #${index + 1}: ${d.codigo} (${d.criterioNombre})`,
      d.rubrica ? `Rúbrica aplicable:\n${d.rubrica}` : "",
      "Postura Agente Alpha:",
      `- Cumple: ${d.alphaVote?.cumple ?? "null"} | Confianza: ${d.alphaVote?.confianza ?? 0}`,
      `- Evidencia: "${d.alphaVote?.evidencia ?? ""}"`,
      `- Razonamiento: ${d.alphaVote?.razonamiento ?? ""}`,
      "Postura Agente Beta:",
      `- Cumple: ${d.betaVote?.cumple ?? "null"} | Confianza: ${d.betaVote?.confianza ?? 0}`,
      `- Evidencia: "${d.betaVote?.evidencia ?? ""}"`,
      `- Razonamiento: ${d.betaVote?.razonamiento ?? ""}`,
      `Motivo de discrepancia: ${d.motivo}`,
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");

  return [
    "Sos el Juez Arbitral de Calidad de la Mesa de Ayuda TI de Correo Argentino.",
    "Dos agentes evaluadores discreparon en los siguientes criterios de un ticket.",
    "Tu tarea es analizar los argumentos contrapuestos de ambos agentes y emitir un laudo definitivo fundado para cada criterio en disputa.",
    "IMPORTANTE: Redactá tu veredicto y razonamiento en español claro y profesional para un supervisor humano. NO uses nombres de variables técnicas ni sintaxis de código como 'ticket_id_1', 'custom_field_x', etc. Referite a 'el ticket', 'el número de caso' o los hechos concretos.",
    "Respondé ÚNICAMENTE con JSON válido, sin markdown ni explicaciones adicionales, con esta estructura exacta:",
    '{"resumen":"Laudo arbitral del Council","resultados":[{"codigo":"<code>","cumple":true,"confianza":0.9,"evidencia":"...","razonamiento":"..."}]}',
    "",
    "CRITERIOS EN DISPUTA A RESOLVER:",
    disputesBlocks,
  ].join("\n");
}

export async function evaluateWithCouncil(
  channel: ChannelType,
  meta: ExtractedQualityMetadata,
  rawIncident?: any,
  preloadedTimeline?: InvgateTimelineEntry[],
  audioTranscript?: string,
  options?: {
    hasTicket?: boolean;
    alphaProvider?: AiProvider;
    betaProvider?: AiProvider;
    judgeProvider?: AiProvider;
  },
): Promise<CouncilEvaluationResult> {
  const hasAudio = Boolean(audioTranscript?.trim());
  const hasEmailThread = Boolean(meta.emailThread?.hasOperatorReply);
  const hasTicket = options?.hasTicket !== false;
  const criteria = getAiCriteria(channel, { hasAudio, hasEmailThread, hasTicket });
  if (criteria.length === 0) {
    return {
      model: "council",
      isCouncil: true,
      resumen: "Sin criterios evaluables.",
      verdicts: [],
      debate: {},
    };
  }

  acquireAiSlot();
  try {
    const timeline =
      preloadedTimeline ??
      (hasTicket && meta.caseNumber && /^\d+$/.test(String(meta.caseNumber).trim())
        ? await fetchInvgateTicketTimeline(meta.caseNumber).catch((err) => {
            console.warn("[councilEvaluator] Fallback a comentarios API (falló scraping):", err?.message);
            return [] as InvgateTimelineEntry[];
          })
        : []);

    const ticketContext = buildTicketContext(meta, rawIncident, timeline, audioTranscript);
    const { alpha: alphaCriteria, beta: betaCriteria } = splitCriteriaByAgent(criteria);

    const alphaProvider = options?.alphaProvider ?? new OpenCodeProvider(ALPHA_MODEL);
    const betaProvider = options?.betaProvider ?? new OpenCodeProvider(BETA_MODEL);

    const includeReclamo = channel === "wise_call" || channel === "wise_email";
    const includeCoaching = channel !== "invgate_ticket";
    // Ejecución paralela protegida
    const [alphaTask, betaTask] = await Promise.allSettled([
      alphaCriteria.length > 0
        ? alphaProvider.evaluate(buildPrompt(alphaCriteria, ticketContext, undefined, includeReclamo, includeCoaching))
        : Promise.resolve(null),
      betaCriteria.length > 0
        ? betaProvider.evaluate(buildPrompt(betaCriteria, ticketContext, undefined, false, false))
        : Promise.resolve(null),
    ]);

    const alphaMap: AgentVerdictMap = {};
    let alphaSummary = "";
    let alphaReclamoSignal = undefined;
    let alphaCoaching = undefined;
    if (alphaTask.status === "fulfilled" && alphaTask.value) {
      try {
        const parsed = parseVerdicts(alphaTask.value, new Set(alphaCriteria.map((c) => c.code)));
        alphaSummary = parsed.resumen;
        alphaReclamoSignal = parsed.reclamoSignal;
        alphaCoaching = parsed.coaching;
        for (const v of parsed.verdicts) alphaMap[v.codigo] = v;
      } catch (err) {
        console.warn("[councilEvaluator] Error parseando veredictos de Alpha:", err);
      }
    } else if (alphaTask.status === "rejected") {
      console.warn("[councilEvaluator] Falló Agente Alpha:", alphaTask.reason);
    }

    const betaMap: AgentVerdictMap = {};
    let betaSummary = "";
    if (betaTask.status === "fulfilled" && betaTask.value) {
      try {
        const parsed = parseVerdicts(betaTask.value, new Set(betaCriteria.map((c) => c.code)));
        betaSummary = parsed.resumen;
        for (const v of parsed.verdicts) betaMap[v.codigo] = v;
      } catch (err) {
        console.warn("[councilEvaluator] Error parseando veredictos de Beta:", err);
      }
    } else if (betaTask.status === "rejected") {
      console.warn("[councilEvaluator] Falló Agente Beta:", betaTask.reason);
    }

    // Mapa de metadatos de criterios para el Juez
    const criteriaMeta: Record<string, { name: string; rubrica: string }> = {};
    for (const c of criteria) {
      criteriaMeta[c.code] = {
        name: c.name,
        rubrica: getRubricsForCriteria([c.code]),
      };
    }

    if (Object.keys(alphaMap).length === 0 && Object.keys(betaMap).length === 0) {
      throw new Error("Ambos agentes del Council fallaron al evaluar el caso.");
    }

    const allCodes = criteria.map((c) => c.code);
    const { resolved, disputes } = mergeCouncil(allCodes, alphaMap, betaMap, criteriaMeta);

    const finalVerdicts: AiVerdict[] = [...resolved.map((r) => ({
      codigo: r.codigo,
      cumple: r.cumple,
      confianza: r.confianza,
      evidencia: r.evidencia,
      razonamiento: r.razonamiento,
    }))];

    const debate: Record<string, CouncilDebateEntry> = {};
    for (const r of resolved) {
      const aV = alphaMap[r.codigo];
      const bV = betaMap[r.codigo];
      debate[r.codigo] = {
        codigo: r.codigo,
        criterioNombre: criteriaMeta[r.codigo]?.name ?? r.codigo,
        consenso: r.consenso,
        motivo: r.motivo,
        alphaVote: aV ? { model: ALPHA_MODEL, ...aV } : undefined,
        betaVote: bV ? { model: BETA_MODEL, ...bV } : undefined,
      };
    }

    // Invocación del Juez Nemotron si existen disputas
    if (disputes.length > 0) {
      const judgeProvider = options?.judgeProvider ?? new OpenCodeProvider(JUDGE_MODEL);
      const judgePrompt = buildJudgePrompt(disputes);
      try {
        const judgeRaw = await judgeProvider.evaluate(judgePrompt);
        const { verdicts: judgeVerdicts } = parseVerdicts(judgeRaw, new Set(disputes.map((d) => d.codigo)));
        const judgeMap: AgentVerdictMap = {};
        for (const jv of judgeVerdicts) judgeMap[jv.codigo] = jv;

        for (const d of disputes) {
          const jV = judgeMap[d.codigo];
          const aV = d.alphaVote;
          const bV = d.betaVote;

          if (jV) {
            finalVerdicts.push(jV);
            debate[d.codigo] = {
              codigo: d.codigo,
              criterioNombre: d.criterioNombre,
              consenso: "arbitrado",
              motivo: d.motivo,
              alphaVote: aV ? { model: ALPHA_MODEL, ...aV } : undefined,
              betaVote: bV ? { model: BETA_MODEL, ...bV } : undefined,
              judgeVote: { model: JUDGE_MODEL, ...jV },
            };
          } else {
            // Juez no incluyó este código -> arbitraje_fallido
            finalVerdicts.push({
              codigo: d.codigo,
              cumple: null,
              confianza: 0.5,
              evidencia: aV?.evidencia || bV?.evidencia || "",
              razonamiento: "Arbitraje inconcluso: el juez no devolvió dictamen para este criterio.",
            });
            debate[d.codigo] = {
              codigo: d.codigo,
              criterioNombre: d.criterioNombre,
              consenso: "arbitraje_fallido",
              motivo: d.motivo,
              alphaVote: aV ? { model: ALPHA_MODEL, ...aV } : undefined,
              betaVote: bV ? { model: BETA_MODEL, ...bV } : undefined,
            };
          }
        }
      } catch (err) {
        console.warn("[councilEvaluator] Error en la llamada al Juez Nemotron:", err);
        for (const d of disputes) {
          finalVerdicts.push({
            codigo: d.codigo,
            cumple: null,
            confianza: 0.5,
            evidencia: d.alphaVote?.evidencia || d.betaVote?.evidencia || "",
            razonamiento: "Arbitraje fallido: error de conexión con el juez arbitral.",
          });
          debate[d.codigo] = {
            codigo: d.codigo,
            criterioNombre: d.criterioNombre,
            consenso: "arbitraje_fallido",
            motivo: d.motivo,
            alphaVote: d.alphaVote ? { model: ALPHA_MODEL, ...d.alphaVote } : undefined,
            betaVote: d.betaVote ? { model: BETA_MODEL, ...d.betaVote } : undefined,
          };
        }
      }
    }

    const unevaluated = resolved.filter((r) => r.consenso === "no_evaluado");
    let finalSummary = alphaSummary || betaSummary || "Atención evaluada por el Council de Calidad MDA.";
    if (unevaluated.length > 0) {
      const criteriaList = unevaluated
        .map((u) => (criteriaMeta[u.codigo]?.name ? `${criteriaMeta[u.codigo].name} (${u.codigo})` : u.codigo))
        .join(", ");
      finalSummary += `\n\n[ADVERTENCIA: ${unevaluated.length} criterio(s) no fueron evaluados por indisponibilidad del agente especialista: ${criteriaList}]`;
    }

    // Preservar el orden exacto de los criterios según la rúbrica del canal
    const verdictsByCode = new Map(finalVerdicts.map((v) => [v.codigo, v]));
    const orderedVerdicts = criteria
      .map((c) => verdictsByCode.get(c.code))
      .filter((v): v is AiVerdict => v !== undefined);

    return {
      model: "council",
      isCouncil: true,
      resumen: finalSummary,
      verdicts: orderedVerdicts,
      debate,
      reclamoSignal: alphaReclamoSignal,
      coaching: alphaCoaching,
    };
  } finally {
    releaseAiSlot();
  }
}

