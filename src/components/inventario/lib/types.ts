export type InventoryTab = "terminales" | "cubics" | "mediterranea" | "ttsts";

export type SortDirection = "asc" | "desc";

export interface SortState {
  sortBy: string | null;
  sortOrder: SortDirection | null;
}

export interface TerminalFilterState {
  search: string;
  os: string;
  osVariant: string;
  architecture: string;
  brand: string;
  ram: string;
  model: string;
  status: string;
  duplicates: boolean;
  orphans: boolean;
}

export interface MediterraneaFilterState {
  search: string;
  mediterraneaType: string;
  status: string;
}

export interface TTSTSFilterState {
  search: string;
  status: string;
  ttType: string;
  vmFilter: string;
}
