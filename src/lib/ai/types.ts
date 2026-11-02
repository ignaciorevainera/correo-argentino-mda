import { z } from "zod";

export const AiVerdictSchema = z.object({
  codigo: z.string(),
  cumple: z.boolean().nullable(),
  confianza: z.number().min(0).max(1).catch(0.5),
  evidencia: z.string().catch(""),
  razonamiento: z.string().optional().catch(""),
});

export type AiVerdict = z.infer<typeof AiVerdictSchema>;

export const ReclamoSignalSchema = z.object({
  detected: z.boolean().catch(false),
  type: z.enum(["reclamo", "reiteracion", "consulta_estado", "ninguno"]).optional(),
  confidence: z.number().min(0).max(1).catch(0.5),
  evidence: z.string().catch(""),
  suggestedMode: z.enum(["reclamo", "nuevo"]).catch("nuevo"),
  rationale: z.string().catch(""),
});

export type ReclamoNovedadSignal = z.infer<typeof ReclamoSignalSchema>;

export const CoachingSchema = z.object({
  fortalezas: z.array(z.string()).default([]),
  oportunidades: z.array(z.string()).default([]),
  respuestaModelo: z.string().default(""),
});

export type CoachingFeedback = z.infer<typeof CoachingSchema>;

export const AiResponseSchema = z.object({
  resumen: z.string().optional().catch(""),
  resultados: z.array(AiVerdictSchema),
  reclamoSignal: ReclamoSignalSchema.nullish().catch(null),
  coaching: CoachingSchema.nullish().default(null).catch(null),
});

export type AiResponse = z.infer<typeof AiResponseSchema>;

export interface AiProvider {
  name: string;
  evaluate(prompt: string): Promise<string>;
}

export interface AiEvaluationOptions {
  model?: string;
  provider?: "opencode";
}

export interface CouncilVote {
  model: string;
  cumple: boolean | null;
  confianza: number;
  evidencia: string;
  razonamiento: string;
}

export interface CouncilDebateEntry {
  codigo: string;
  criterioNombre: string;
  consenso: "directo" | "arbitrado" | "sin_oposicion" | "agente_especialista" | "arbitraje_fallido" | "no_evaluado";
  motivo?: "sin_evidencia" | "acuerdo_alto" | "baja_confianza" | "discrepancia_cumple" | "agente_unico" | "agente_fallido";
  alphaVote?: CouncilVote;
  betaVote?: CouncilVote;
  judgeVote?: CouncilVote;
}

export interface CouncilEvaluationResult {
  model: string;
  isCouncil: true;
  resumen: string;
  verdicts: AiVerdict[];
  debate: Record<string, CouncilDebateEntry>;
  reclamoSignal?: ReclamoNovedadSignal;
  coaching?: CoachingFeedback | null;
}

