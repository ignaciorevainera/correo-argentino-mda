/**
 * Mesas de ayuda InvGate de Tecnología Local (TecLocal) por región.
 * El ID apunta al sub-helpdesk de nivel 1 (técnicos) de cada mesa.
 * CABA y PBA/LP comparten la misma mesa TecLocal PBA/LP.
 */
export interface TechRegionConfig {
  helpdeskLevelId: number;
  helpdeskName: string;
}

export const TECLOCAL_REGIONS: Record<string, TechRegionConfig> = {
  "PBA-LP": { helpdeskLevelId: 5970, helpdeskName: "TecLocal PBA/LP" },
  CABA: { helpdeskLevelId: 5970, helpdeskName: "TecLocal PBA/LP" },
  NEA: { helpdeskLevelId: 5972, helpdeskName: "TecLocal Centro-NEA" },
  NOA: { helpdeskLevelId: 5974, helpdeskName: "TecLocal Cuyo-NOA" },
  SUR: { helpdeskLevelId: 5976, helpdeskName: "TecLocal Sur" },
};
