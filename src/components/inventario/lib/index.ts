import { getCleanBase } from "@lib/baseUrl";
import { updateBrowserUrl, updateCsvExportHref } from "@lib/clientUrlSync";
import type { InventoryTab, SortDirection } from "./types";
import {
  initInventoryTabs,
  getActiveTab,
  setActiveTab,
  updateTabs,
  updateTabBadges,
} from "./inventoryTabs";
import {
  initTerminalsTable,
  fetchTerminals,
  triggerSearch,
  getTerminalFilters,
  getTerminalSort,
  setTerminalSort,
  syncModelOptionsWithBrand,
} from "./terminalsTable";
import {
  initMediterraneaTable,
  fetchMediterranea,
  triggerMediSearch,
  getMediFilters,
  getMediSort,
  setMediSort,
} from "./mediterraneaTable";
import {
  initTtstsTable,
  fetchTT,
  triggerTTSearch,
  getTTFilters,
  getTTSort,
  setTTSort,
  syncTtVmFilterVisibility,
} from "./ttstsTable";
import { initCubicsLive } from "./cubicsLive";
import { renderFilterChips } from "./filterChips";

export * from "./types";
export * from "./inventoryTabs";
export * from "./terminalsTable";
export * from "./mediterraneaTable";
export * from "./ttstsTable";
export * from "./cubicsLive";
export * from "./filterChips";

export function syncFiltersToURL(): void {
  const params = new URLSearchParams(window.location.search);
  const activeTab = getActiveTab();

  params.set("inventory_tabs", activeTab);

  let activeSortBy: string | null = null;
  let activeSortOrder: SortDirection | null = null;

  if (activeTab === "terminales") {
    params.delete("mediterraneaType");
    params.delete("ttType");
    params.delete("vmFilter");

    const t = getTerminalFilters();
    const filters: Record<string, string> = {
      search: t.search,
      os: t.os,
      osVariant: t.osVariant,
      architecture: t.architecture,
      brand: t.brand,
      ram: t.ram,
      model: t.model,
      status: t.status,
      duplicates: t.duplicates ? "true" : "",
      orphans: t.orphans ? "true" : "",
    };

    for (const [key, val] of Object.entries(filters)) {
      if (val && val !== "all") {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }

    const tSort = getTerminalSort();
    activeSortBy = tSort.sortBy;
    activeSortOrder = tSort.sortOrder;
  } else if (activeTab === "mediterranea") {
    params.delete("os");
    params.delete("osVariant");
    params.delete("architecture");
    params.delete("brand");
    params.delete("ram");
    params.delete("model");
    params.delete("duplicates");
    params.delete("orphans");
    params.delete("ttType");
    params.delete("vmFilter");

    const m = getMediFilters();
    const filters: Record<string, string> = {
      search: m.search,
      mediterraneaType: m.mediterraneaType,
      status: m.status,
    };

    for (const [key, val] of Object.entries(filters)) {
      if (val && val !== "all") {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }

    const mSort = getMediSort();
    activeSortBy = mSort.sortBy;
    activeSortOrder = mSort.sortOrder;
  } else if (activeTab === "ttsts") {
    params.delete("os");
    params.delete("osVariant");
    params.delete("architecture");
    params.delete("brand");
    params.delete("ram");
    params.delete("model");
    params.delete("mediterraneaType");
    params.delete("duplicates");
    params.delete("orphans");

    const tt = getTTFilters();
    const filters: Record<string, string> = {
      search: tt.search,
      status: tt.status,
      ttType: tt.ttType,
      vmFilter: tt.vmFilter,
    };

    for (const [key, val] of Object.entries(filters)) {
      if (val && val !== "all") {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }

    const ttSort = getTTSort();
    activeSortBy = ttSort.sortBy;
    activeSortOrder = ttSort.sortOrder;
  } else {
    params.delete("os");
    params.delete("osVariant");
    params.delete("architecture");
    params.delete("brand");
    params.delete("ram");
    params.delete("model");
    params.delete("mediterraneaType");
    params.delete("duplicates");
    params.delete("orphans");
    params.delete("status");
    params.delete("search");
    params.delete("ttType");
    params.delete("vmFilter");
  }

  if (activeSortBy && activeSortOrder) {
    params.set("sortBy", activeSortBy);
    params.set("sortOrder", activeSortOrder);
  } else {
    params.delete("sortBy");
    params.delete("sortOrder");
  }

  updateBrowserUrl(params.toString());

  const cleanBase = getCleanBase();
  const tFilters = getTerminalFilters();
  const tExportParams = new URLSearchParams();
  const tMap: Record<string, string> = {
    search: tFilters.search,
    os: tFilters.os,
    osVariant: tFilters.osVariant,
    architecture: tFilters.architecture,
    brand: tFilters.brand,
    ram: tFilters.ram,
    model: tFilters.model,
    status: tFilters.status,
    duplicates: tFilters.duplicates ? "true" : "",
    orphans: tFilters.orphans ? "true" : "",
  };
  for (const [key, val] of Object.entries(tMap)) {
    if (val && val !== "all") tExportParams.set(key, val);
  }
  updateCsvExportHref(
    "export-csv-terminales-btn",
    `${cleanBase}api/export/terminals`,
    tExportParams.toString(),
  );

  const mFilters = getMediFilters();
  const mExportParams = new URLSearchParams();
  mExportParams.set("isMediterranea", "true");
  if (mFilters.search) mExportParams.set("search", mFilters.search);
  if (mFilters.mediterraneaType && mFilters.mediterraneaType !== "all") {
    mExportParams.set("mediterraneaType", mFilters.mediterraneaType);
  }
  if (mFilters.status && mFilters.status !== "all") {
    mExportParams.set("status", mFilters.status);
  }
  updateCsvExportHref(
    "export-csv-medi-btn",
    `${cleanBase}api/export/terminals`,
    mExportParams.toString(),
  );

  const ttFilters = getTTFilters();
  const ttExportParams = new URLSearchParams();
  ttExportParams.set("isTT", "true");
  if (ttFilters.search) ttExportParams.set("search", ttFilters.search);
  if (ttFilters.status && ttFilters.status !== "all") {
    ttExportParams.set("status", ttFilters.status);
  }
  if (ttFilters.ttType && ttFilters.ttType !== "all") {
    ttExportParams.set("ttType", ttFilters.ttType);
  }
  if (ttFilters.vmFilter && ttFilters.vmFilter !== "all") {
    ttExportParams.set("vmFilter", ttFilters.vmFilter);
  }
  updateCsvExportHref(
    "export-csv-tt-btn",
    `${cleanBase}api/export/terminals`,
    ttExportParams.toString(),
  );

  const terminalSearchInput =
    document.querySelector<HTMLInputElement>("#terminal-search");
  const osFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-os");
  const osVariantFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-os-variant");
  const archFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-arch");
  const brandFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-brand");
  const ramFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-ram");
  const modelFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-model");
  const statusRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-terminal-status]"),
  );
  const duplicatesToggle = document.getElementById(
    "filter-duplicates",
  ) as HTMLInputElement | null;
  const orphansToggle = document.getElementById(
    "filter-orphans",
  ) as HTMLInputElement | null;

  const mediSearchInput =
    document.querySelector<HTMLInputElement>("#medi-search");
  const mediTypeSelect =
    document.querySelector<HTMLSelectElement>("#filter-medi-type");
  const mediStatusRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-medi-status]"),
  );

  const ttSearchInput =
    document.querySelector<HTMLInputElement>("#tt-search");
  const ttStatusRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-tt-status]"),
  );
  const ttTypeRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-tt-type]"),
  );
  const ttVmRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-tt-vm]"),
  );

  renderFilterChips({
    activeTab,
    terminales: {
      search: tFilters.search,
      os: tFilters.os,
      osVariant: tFilters.osVariant,
      arch: tFilters.architecture,
      brand: tFilters.brand,
      ram: tFilters.ram,
      model: tFilters.model,
      status: tFilters.status,
      duplicates: tFilters.duplicates,
      orphans: tFilters.orphans,
      onClearSearch: () => {
        if (terminalSearchInput) terminalSearchInput.value = "";
        triggerSearch();
      },
      onClearOs: () => {
        if (osFilterSelect) osFilterSelect.value = "all";
        triggerSearch();
      },
      onClearOsVariant: () => {
        if (osVariantFilterSelect) osVariantFilterSelect.value = "all";
        triggerSearch();
      },
      onClearArch: () => {
        if (archFilterSelect) archFilterSelect.value = "all";
        triggerSearch();
      },
      onClearBrand: () => {
        if (brandFilterSelect) brandFilterSelect.value = "all";
        syncModelOptionsWithBrand();
        triggerSearch();
      },
      onClearRam: () => {
        if (ramFilterSelect) ramFilterSelect.value = "all";
        triggerSearch();
      },
      onClearModel: () => {
        if (modelFilterSelect) modelFilterSelect.value = "all";
        triggerSearch();
      },
      onClearStatus: () => {
        statusRadioInputs.forEach((radio, idx) => {
          radio.checked = idx === 0;
        });
        triggerSearch();
      },
      onClearDuplicates: () => {
        if (duplicatesToggle) duplicatesToggle.checked = false;
        triggerSearch();
      },
      onClearOrphans: () => {
        if (orphansToggle) orphansToggle.checked = false;
        triggerSearch();
      },
    },
    mediterranea: {
      search: mFilters.search,
      type: mFilters.mediterraneaType,
      status: mFilters.status,
      onClearSearch: () => {
        if (mediSearchInput) mediSearchInput.value = "";
        triggerMediSearch();
      },
      onClearType: () => {
        if (mediTypeSelect) mediTypeSelect.value = "all";
        triggerMediSearch();
      },
      onClearStatus: () => {
        mediStatusRadioInputs.forEach((radio, idx) => {
          radio.checked = idx === 0;
        });
        triggerMediSearch();
      },
    },
    ttsts: {
      search: ttFilters.search,
      status: ttFilters.status,
      type: ttFilters.ttType,
      vm: ttFilters.vmFilter,
      onClearSearch: () => {
        if (ttSearchInput) ttSearchInput.value = "";
        triggerTTSearch();
      },
      onClearStatus: () => {
        ttStatusRadioInputs.forEach((radio, idx) => {
          radio.checked = idx === 0;
        });
        triggerTTSearch();
      },
      onClearType: () => {
        ttTypeRadioInputs.forEach((radio, idx) => {
          radio.checked = idx === 0;
        });
        triggerTTSearch();
      },
      onClearVm: () => {
        ttVmRadioInputs.forEach((radio, idx) => {
          radio.checked = idx === 0;
        });
        triggerTTSearch();
      },
    },
  });
}

function applyInitialSortHeaders(
  tableId: string,
  sortBy: string,
  dir: "ascending" | "descending",
): void {
  const table = document.getElementById(tableId);
  if (!table) return;

  table.dataset.tableSortKey = sortBy;
  table.dataset.tableSortDirection = dir;
  const control = table.querySelector(`[data-table-sort-key="${sortBy}"]`);
  if (control) {
    control.setAttribute("data-table-sort-direction", dir);
    control.setAttribute("aria-sort", dir);
    control.querySelectorAll("[data-table-sort-icon]").forEach((icon: any) => {
      const shouldShow = icon.dataset.tableSortIcon === dir;
      icon.classList.toggle("hidden", !shouldShow);
      icon.classList.toggle("opacity-0", !shouldShow);
    });
  }
}

export function init(): void {
  initTerminalsTable(() => {
    syncFiltersToURL();
  });

  initMediterraneaTable(() => {
    syncFiltersToURL();
  });

  initTtstsTable(() => {
    syncFiltersToURL();
  });

  initCubicsLive();

  initInventoryTabs((tab) => {
    syncFiltersToURL();
    const mediContainer = document.getElementById("table-mediterranea-body");
    const ttContainer = document.getElementById("table-ttsts-body");

    if (tab === "mediterranea" && mediContainer?.children.length === 0) {
      fetchMediterranea(true);
    }
    if (tab === "ttsts" && ttContainer?.children.length === 0) {
      fetchTT(true);
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const initialActiveTab =
    (urlParams.get("inventory_tabs") as InventoryTab) || "terminales";
  const initialSortBy = urlParams.get("sortBy");
  const initialSortOrder = (urlParams.get("sortOrder") as SortDirection) || null;

  if (initialSortBy && initialSortOrder) {
    setTerminalSort(initialSortBy, initialSortOrder);
    setMediSort(initialSortBy, initialSortOrder);
    setTTSort(initialSortBy, initialSortOrder);

    const dir = initialSortOrder === "desc" ? "descending" : "ascending";
    applyInitialSortHeaders("table-terminales", initialSortBy, dir);
    applyInitialSortHeaders("table-mediterranea", initialSortBy, dir);
    applyInitialSortHeaders("table-ttsts", initialSortBy, dir);
  }

  if (initialActiveTab === "mediterranea") {
    setActiveTab("mediterranea");
    const mediSearchInput =
      document.querySelector<HTMLInputElement>("#medi-search");
    const mediTypeSelect =
      document.querySelector<HTMLSelectElement>("#filter-medi-type");
    const mediStatusRadioInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-medi-status]"),
    );

    if (mediSearchInput && urlParams.has("search")) {
      mediSearchInput.value = urlParams.get("search") || "";
    }
    if (mediTypeSelect && urlParams.has("mediterraneaType")) {
      mediTypeSelect.value = urlParams.get("mediterraneaType") || "all";
    }
    if (urlParams.has("status")) {
      const statusVal = urlParams.get("status") || "all";
      mediStatusRadioInputs.forEach((radio) => {
        radio.checked = radio.dataset.mediStatus === statusVal;
      });
    }
    fetchMediterranea(true);
  } else if (initialActiveTab === "ttsts") {
    setActiveTab("ttsts");
    const ttSearchInput =
      document.querySelector<HTMLInputElement>("#tt-search");
    const ttStatusRadioInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-tt-status]"),
    );
    const ttTypeRadioInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-tt-type]"),
    );
    const ttVmRadioInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-tt-vm]"),
    );

    if (ttSearchInput && urlParams.has("search")) {
      ttSearchInput.value = urlParams.get("search") || "";
    }
    if (urlParams.has("status")) {
      const statusVal = urlParams.get("status") || "all";
      ttStatusRadioInputs.forEach((radio) => {
        radio.checked = radio.dataset.ttStatus === statusVal;
      });
    }
    if (urlParams.has("ttType")) {
      const typeVal = urlParams.get("ttType") || "all";
      ttTypeRadioInputs.forEach((radio) => {
        radio.checked = radio.dataset.ttType === typeVal;
      });
    }
    if (urlParams.has("vmFilter")) {
      const vmVal = urlParams.get("vmFilter") || "all";
      ttVmRadioInputs.forEach((radio) => {
        radio.checked = radio.dataset.ttVm === vmVal;
      });
    }
    syncTtVmFilterVisibility();
    fetchTT(true);
  } else if (initialActiveTab === "terminales") {
    setActiveTab("terminales");
    const duplicatesToggle = document.getElementById(
      "filter-duplicates",
    ) as HTMLInputElement | null;
    const orphansToggle = document.getElementById(
      "filter-orphans",
    ) as HTMLInputElement | null;

    let needsFetch = false;
    if (urlParams.get("duplicates") === "true" && duplicatesToggle) {
      duplicatesToggle.checked = true;
      needsFetch = true;
    }
    if (urlParams.get("orphans") === "true" && orphansToggle) {
      orphansToggle.checked = true;
      needsFetch = true;
    }
    if (needsFetch) {
      fetchTerminals(true);
    }
  } else if (initialActiveTab === "cubics") {
    setActiveTab("cubics");
  }

  syncFiltersToURL();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
