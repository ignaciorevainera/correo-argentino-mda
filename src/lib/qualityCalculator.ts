import { QUALITY_CONFIG } from "@config/quality";
import type { AuditParameter } from "@/types/quality";


export function calculateAuditScores(
  parameters: AuditParameter[],
  checkedParameterIdsOrCodes: Set<number | string>,
  isCriticalFailure: boolean
) {
  let s1CheckedWeight = 0;
  let s1TotalWeight = 0;
  let s2CheckedWeight = 0;
  let s2TotalWeight = 0;

  for (const param of parameters) {
    // Check if either parameter ID (number or string representation) or code is selected
    const isChecked = 
      checkedParameterIdsOrCodes.has(param.id) || 
      checkedParameterIdsOrCodes.has(String(param.id)) ||
      checkedParameterIdsOrCodes.has(param.code);

    if (param.category === "Interacción con Usuario") {
      s1TotalWeight += param.weight;
      if (isChecked) s1CheckedWeight += param.weight;
    } else if (param.category === "Gestión del Ticket") {
      s2TotalWeight += param.weight;
      if (isChecked) s2CheckedWeight += param.weight;
    }
  }

  const section1Score = s1TotalWeight > 0 ? Math.round((s1CheckedWeight / s1TotalWeight) * 100) : 0;
  const section2Score = s2TotalWeight > 0 ? Math.round((s2CheckedWeight / s2TotalWeight) * 100) : 0;
  
  const s1Weight = QUALITY_CONFIG.sectionWeights["Interacción con Usuario"] ?? 0.5;
  const s2Weight = QUALITY_CONFIG.sectionWeights["Gestión del Ticket"] ?? 0.5;
  let totalScore = Math.round(section1Score * s1Weight + section2Score * s2Weight);

  if (isCriticalFailure) {
    totalScore = Math.round(totalScore * QUALITY_CONFIG.criticalFailurePenaltyMultiplier);
  }

  return {
    section1Score,
    section2Score,
    totalScore,
  };
}
