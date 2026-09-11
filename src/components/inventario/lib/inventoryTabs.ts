import type { InventoryTab } from "./types";

let currentActiveTab: InventoryTab = "terminales";

export function getActiveTab(): InventoryTab {
  const switcher = document.getElementById("inventory-view-switcher");
  const activeTabRadio = switcher?.querySelector(
    'input[type="radio"]:checked',
  ) as HTMLInputElement | null;
  if (activeTabRadio?.value) {
    currentActiveTab = activeTabRadio.value as InventoryTab;
  }
  return currentActiveTab;
}

export function setActiveTab(activeValue: InventoryTab): void {
  const switcher = document.getElementById("inventory-view-switcher");
  const targetRadio = switcher?.querySelector(
    `input[type="radio"][value="${activeValue}"]`,
  ) as HTMLInputElement | null;
  if (targetRadio) {
    targetRadio.checked = true;
  }
  updateTabs(activeValue);
}

export function updateTabs(activeValue: string): void {
  const viewTerminales = document.getElementById("view-terminales");
  const viewCubics = document.getElementById("view-cubics");
  const viewMediterranea = document.getElementById("view-mediterranea");
  const viewTT = document.getElementById("view-ttsts");

  const searchTerminales = document.getElementById("header-search-terminales");
  const searchCubics = document.getElementById("header-search-cubics");
  const searchMediterranea = document.getElementById(
    "header-search-mediterranea",
  );
  const searchTT = document.getElementById("header-search-ttsts");

  const rightTerminales = document.getElementById("header-right-terminales");
  const rightCubics = document.getElementById("header-right-cubics");
  const rightMediterranea = document.getElementById("header-right-mediterranea");
  const rightTT = document.getElementById("header-right-ttsts");

  const isTerminales = activeValue === "terminales";
  const isCubics = activeValue === "cubics";
  const isMediterranea = activeValue === "mediterranea";
  const isTTSTS = activeValue === "ttsts";

  currentActiveTab = activeValue as InventoryTab;

  viewTerminales?.classList.toggle("hidden", !isTerminales);
  viewCubics?.classList.toggle("hidden", !isCubics);
  viewMediterranea?.classList.toggle("hidden", !isMediterranea);
  viewTT?.classList.toggle("hidden", !isTTSTS);

  if (isTerminales) {
    searchTerminales?.classList.remove("hidden");
    searchCubics?.classList.add("hidden");
    searchMediterranea?.classList.add("hidden");
    searchTT?.classList.add("hidden");

    rightTerminales?.classList.remove("hidden");
    rightTerminales?.classList.add("flex");

    rightCubics?.classList.add("hidden");
    rightCubics?.classList.remove("flex");

    rightMediterranea?.classList.add("hidden");
    rightMediterranea?.classList.remove("flex");

    rightTT?.classList.add("hidden");
    rightTT?.classList.remove("flex");
  } else if (isCubics) {
    searchTerminales?.classList.add("hidden");
    searchCubics?.classList.remove("hidden");
    searchMediterranea?.classList.add("hidden");
    searchTT?.classList.add("hidden");

    rightTerminales?.classList.add("hidden");
    rightTerminales?.classList.remove("flex");

    rightCubics?.classList.remove("hidden");
    rightCubics?.classList.add("flex");

    rightMediterranea?.classList.add("hidden");
    rightMediterranea?.classList.remove("flex");

    rightTT?.classList.add("hidden");
    rightTT?.classList.remove("flex");
  } else if (isMediterranea) {
    searchTerminales?.classList.add("hidden");
    searchCubics?.classList.add("hidden");
    searchMediterranea?.classList.remove("hidden");
    searchTT?.classList.add("hidden");

    rightTerminales?.classList.add("hidden");
    rightTerminales?.classList.remove("flex");

    rightCubics?.classList.add("hidden");
    rightCubics?.classList.remove("flex");

    rightMediterranea?.classList.remove("hidden");
    rightMediterranea?.classList.add("flex");

    rightTT?.classList.add("hidden");
    rightTT?.classList.remove("flex");
  } else {
    searchTerminales?.classList.add("hidden");
    searchCubics?.classList.add("hidden");
    searchMediterranea?.classList.add("hidden");
    searchTT?.classList.remove("hidden");

    rightTerminales?.classList.add("hidden");
    rightTerminales?.classList.remove("flex");

    rightCubics?.classList.add("hidden");
    rightCubics?.classList.remove("flex");

    rightMediterranea?.classList.add("hidden");
    rightMediterranea?.classList.remove("flex");

    rightTT?.classList.remove("hidden");
    rightTT?.classList.add("flex");
  }
}

export function updateTabBadges(
  counts: Partial<Record<InventoryTab, number | string>>,
): void {
  const switcher = document.getElementById("inventory-view-switcher");
  if (!switcher) return;

  for (const [tabKey, count] of Object.entries(counts)) {
    const tabLabel = switcher.querySelector(
      `[data-tab-value="${tabKey}"] .badge, label:has(input[value="${tabKey}"]) .badge`,
    );
    if (tabLabel) {
      tabLabel.textContent = String(count);
    }
  }
}

export function initInventoryTabs(
  onTabChange?: (tab: InventoryTab) => void,
): void {
  const switcher = document.getElementById("inventory-view-switcher");
  switcher?.addEventListener("view-change", (e: any) => {
    const value = e.detail.value as InventoryTab;
    updateTabs(value);
    onTabChange?.(value);
  });
}
