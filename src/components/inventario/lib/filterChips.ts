import type { InventoryTab } from "./types";

export const filterValueLabels: Record<string, string> = {
  win11: "Windows 11",
  win10: "Windows 10",
  win7: "Windows 7",
  winxp: "Windows XP",
  winserver: "Windows Server",
  ubuntu: "Ubuntu",
  debian: "Debian",
  "64 bits": "64 bits",
  "32 bits": "32 bits",
  dell: "Dell",
  lenovo: "Lenovo",
  hp: "HP",
  bangho: "Banghó",
  coradir: "Coradir",
  "<=1gb": "≤ 1 GB",
  "2gb": "2 GB",
  "4gb": "4 GB",
  "8gb": "8 GB",
  ">=16gb": "≥ 16 GB",
  online: "Online",
  offline: "Offline",
  turnero: "Turneros",
  tv: "TVs",
  tyt: "Solo T&T",
  sts: "Solo STS",
  with: "Con VM",
  without: "Sin VM",
};

export const chipLabel = (value: string): string =>
  filterValueLabels[value] ?? value;

export const makeFilterChip = (
  labelText: string,
  onRemove: () => void,
): HTMLDivElement => {
  const chip = document.createElement("div");
  chip.className = "badge badge-soft badge-neutral gap-1 whitespace-nowrap";
  chip.textContent = labelText;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "opacity-60 hover:opacity-100";
  removeBtn.textContent = "✕";
  removeBtn.setAttribute("aria-label", `Quitar filtro ${labelText}`);
  removeBtn.addEventListener("click", onRemove);

  chip.appendChild(removeBtn);
  return chip;
};

export interface ActiveChipsConfig {
  activeTab: InventoryTab;
  terminales?: {
    search: string;
    os: string;
    osVariant: string;
    arch: string;
    brand: string;
    ram: string;
    model: string;
    status: string;
    duplicates: boolean;
    orphans: boolean;
    onClearSearch: () => void;
    onClearOs: () => void;
    onClearOsVariant: () => void;
    onClearArch: () => void;
    onClearBrand: () => void;
    onClearRam: () => void;
    onClearModel: () => void;
    onClearStatus: () => void;
    onClearDuplicates: () => void;
    onClearOrphans: () => void;
  };
  mediterranea?: {
    search: string;
    type: string;
    status: string;
    onClearSearch: () => void;
    onClearType: () => void;
    onClearStatus: () => void;
  };
  ttsts?: {
    search: string;
    status: string;
    type: string;
    vm: string;
    onClearSearch: () => void;
    onClearStatus: () => void;
    onClearType: () => void;
    onClearVm: () => void;
  };
}

export function renderFilterChips(config: ActiveChipsConfig): void {
  const chipsContainer = document.getElementById("active-filter-chips");
  if (!chipsContainer) return;

  const chips: HTMLDivElement[] = [];

  if (config.activeTab === "terminales" && config.terminales) {
    const t = config.terminales;
    if (t.search) {
      chips.push(makeFilterChip(`"${t.search}"`, t.onClearSearch));
    }
    if (t.os && t.os !== "all") {
      chips.push(makeFilterChip(chipLabel(t.os), t.onClearOs));
    }
    if (t.osVariant && t.osVariant !== "all") {
      chips.push(makeFilterChip(chipLabel(t.osVariant), t.onClearOsVariant));
    }
    if (t.arch && t.arch !== "all") {
      chips.push(makeFilterChip(chipLabel(t.arch), t.onClearArch));
    }
    if (t.brand && t.brand !== "all") {
      chips.push(makeFilterChip(chipLabel(t.brand), t.onClearBrand));
    }
    if (t.ram && t.ram !== "all") {
      chips.push(makeFilterChip(chipLabel(t.ram), t.onClearRam));
    }
    if (t.model && t.model !== "all") {
      chips.push(makeFilterChip(chipLabel(t.model), t.onClearModel));
    }
    if (t.status && t.status !== "all") {
      chips.push(makeFilterChip(chipLabel(t.status), t.onClearStatus));
    }
    if (t.duplicates) {
      chips.push(makeFilterChip("Duplicados", t.onClearDuplicates));
    }
    if (t.orphans) {
      chips.push(makeFilterChip("Sin ubicación", t.onClearOrphans));
    }
  } else if (config.activeTab === "mediterranea" && config.mediterranea) {
    const m = config.mediterranea;
    if (m.search) {
      chips.push(makeFilterChip(`"${m.search}"`, m.onClearSearch));
    }
    if (m.type && m.type !== "all") {
      chips.push(makeFilterChip(chipLabel(m.type), m.onClearType));
    }
    if (m.status && m.status !== "all") {
      chips.push(makeFilterChip(chipLabel(m.status), m.onClearStatus));
    }
  } else if (config.activeTab === "ttsts" && config.ttsts) {
    const tt = config.ttsts;
    if (tt.search) {
      chips.push(makeFilterChip(`"${tt.search}"`, tt.onClearSearch));
    }
    if (tt.status && tt.status !== "all") {
      chips.push(makeFilterChip(chipLabel(tt.status), tt.onClearStatus));
    }
    if (tt.type && tt.type !== "all") {
      chips.push(makeFilterChip(chipLabel(tt.type), tt.onClearType));
    }
    if (tt.vm && tt.vm !== "all" && tt.type === "tyt") {
      chips.push(makeFilterChip(chipLabel(tt.vm), tt.onClearVm));
    }
  }

  chipsContainer.replaceChildren(...chips);
  chipsContainer.classList.toggle("hidden", chips.length === 0);
  chipsContainer.classList.toggle("flex", chips.length > 0);
}
