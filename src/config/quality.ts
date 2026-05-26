export const QUALITY_CONFIG = {
  // Factor multiplicador de penalización por falla crítica.
  // 0.5 equivale a reducir a la mitad (50%) el puntaje final de la auditoría.
  criticalFailurePenaltyMultiplier: 0.5,
  // Pesos relativos de cada sección. Deben sumar 1.0
  sectionWeights: {
    "Interacción con Usuario": 0.5,
    "Gestión del Ticket": 0.5,
  },
};
