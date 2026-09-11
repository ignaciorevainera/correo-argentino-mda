import { highlightSearchTargets } from "@lib/clientSearch";
import { getCleanBase } from "@lib/baseUrl";
import type { TerminalFilterState, SortDirection } from "./types";

let currentPage = 1;
let currentSearch = "";
let currentOs = "all";
let currentOsVariant = "all";
let currentArch = "all";
let currentBrand = "all";
let currentRam = "all";
let currentModel = "all";
let currentStatus = "all";
let currentDuplicates = false;
let currentOrphans = false;
let isLoading = false;
let hasMore = false;
let currentSortBy: string | null = null;
let currentSortOrder: SortDirection | null = null;

let debounceTimeout: number | undefined;
let onFiltersChangedCallback: (() => void) | null = null;

export function getTerminalFilters(): TerminalFilterState {
  return {
    search: currentSearch,
    os: currentOs,
    osVariant: currentOsVariant,
    architecture: currentArch,
    brand: currentBrand,
    ram: currentRam,
    model: currentModel,
    status: currentStatus,
    duplicates: currentDuplicates,
    orphans: currentOrphans,
  };
}

export function getTerminalSort(): {
  sortBy: string | null;
  sortOrder: SortDirection | null;
} {
  return { sortBy: currentSortBy, sortOrder: currentSortOrder };
}

export function setTerminalSort(
  sortBy: string | null,
  sortOrder: SortDirection | null,
): void {
  currentSortBy = sortBy;
  currentSortOrder = sortOrder;
}

export function syncModelOptionsWithBrand(): void {
  const brandFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-brand");
  const modelFilterSelect =
    document.querySelector<HTMLSelectElement>("#filter-model");
  if (!modelFilterSelect || !brandFilterSelect) return;

  const selectedBrand = brandFilterSelect.value;
  let currentModelStillValid = false;

  Array.from(modelFilterSelect.options).forEach((opt) => {
    if (opt.value === "all") return;
    const brand = opt.dataset.brand || "";
    const matches = selectedBrand === "all" || brand === selectedBrand;
    opt.disabled = !matches;
    opt.classList.toggle("opacity-40", !matches);
    if (opt.value === modelFilterSelect.value && matches) {
      currentModelStillValid = true;
    }
  });

  if (!currentModelStillValid) {
    modelFilterSelect.value = "all";
    currentModel = "all";
  }
}

export async function fetchTerminals(
  isNewSearch: boolean,
  showLoadingUI = true,
): Promise<void> {
  const terminalsSentinel = document.getElementById(
    "scroll-sentinel-terminales",
  );
  const terminalsSpinner = document.getElementById(
    "loading-spinner-terminales",
  );
  const terminalsContainer = document.getElementById("table-terminales-body");
  const totalCountBadge = document.getElementById(
    "total-count-badge-terminales",
  );

  if (isLoading) return;
  isLoading = true;
  if (showLoadingUI) terminalsSpinner?.classList.remove("hidden");

  try {
    const params = new URLSearchParams();
    params.set("page", currentPage.toString());
    params.set("limit", "50");
    if (currentSearch) params.set("search", currentSearch);
    if (currentOs && currentOs !== "all") params.set("os", currentOs);
    if (currentOsVariant && currentOsVariant !== "all") {
      params.set("osVariant", currentOsVariant);
    }
    if (currentArch && currentArch !== "all") {
      params.set("architecture", currentArch);
    }
    if (currentBrand && currentBrand !== "all") {
      params.set("brand", currentBrand);
    }
    if (currentRam && currentRam !== "all") params.set("ram", currentRam);
    if (currentModel && currentModel !== "all") {
      params.set("model", currentModel);
    }
    if (currentStatus && currentStatus !== "all") {
      params.set("status", currentStatus);
    }
    if (currentDuplicates) params.set("duplicates", "true");
    if (currentOrphans) params.set("orphans", "true");
    if (currentSortBy) {
      params.set("sortBy", currentSortBy);
      if (currentSortOrder) params.set("sortOrder", currentSortOrder);
    }

    const cleanBase = getCleanBase();
    const response = await fetch(`${cleanBase}api/terminals?${params.toString()}`);
    if (!response.ok) throw new Error("API call failed");

    const html = await response.text();
    hasMore = response.headers.get("X-Has-More") === "true";
    const totalCount = response.headers.get("X-Total-Count") || "0";

    if (totalCountBadge) {
      totalCountBadge.textContent = `${totalCount} resultados`;
    }

    if (terminalsContainer) {
      if (isNewSearch) {
        terminalsContainer.innerHTML = html;
      } else {
        terminalsContainer.insertAdjacentHTML("beforeend", html);
      }
    }

    const rowCount =
      terminalsContainer?.querySelectorAll("[data-terminal-row]").length ?? 0;
    const noResultsState = document.getElementById(
      "no-results-state-terminales",
    );
    const tableWrapper = document.getElementById("terminals-table-wrapper");

    if (noResultsState && tableWrapper) {
      if (rowCount === 0) {
        noResultsState.classList.remove("hidden");
        noResultsState.classList.add("flex");
        tableWrapper.classList.add("hidden");
      } else {
        noResultsState.classList.add("hidden");
        noResultsState.classList.remove("flex");
        tableWrapper.classList.remove("hidden");
      }
    }

    if (currentSearch && terminalsContainer) {
      const newArticles = Array.from(
        terminalsContainer.querySelectorAll<HTMLElement>("[data-terminal-row]"),
      );
      newArticles.forEach((item) => {
        highlightSearchTargets(item, currentSearch);
      });
    }

    if (!hasMore) {
      terminalsSentinel?.classList.add("hidden");
    } else {
      terminalsSentinel?.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Error fetching terminals:", err);
  } finally {
    isLoading = false;
    if (showLoadingUI) terminalsSpinner?.classList.add("hidden");
  }
}

export function triggerSearch(): void {
  window.clearTimeout(debounceTimeout);
  debounceTimeout = window.setTimeout(() => {
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

    currentPage = 1;
    currentSearch = terminalSearchInput?.value.trim() || "";
    currentOs = osFilterSelect?.value || "all";
    currentOsVariant = osVariantFilterSelect?.value || "all";
    currentArch = archFilterSelect?.value || "all";
    currentBrand = brandFilterSelect?.value || "all";
    currentRam = ramFilterSelect?.value || "all";
    currentModel = modelFilterSelect?.value || "all";
    currentStatus =
      statusRadioInputs.find((r) => r.checked)?.dataset.terminalStatus || "all";
    currentDuplicates = duplicatesToggle?.checked ?? false;
    currentOrphans = orphansToggle?.checked ?? false;

    fetchTerminals(true);
    onFiltersChangedCallback?.();
  }, 300);
}

export function resetTerminalFilters(): void {
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

  if (terminalSearchInput) terminalSearchInput.value = "";
  if (osFilterSelect) osFilterSelect.value = "all";
  if (osVariantFilterSelect) {
    osVariantFilterSelect.innerHTML =
      '<option value="all">Variante (Todas)</option>';
    osVariantFilterSelect.disabled = true;
    osVariantFilterSelect.value = "all";
  }
  if (archFilterSelect) archFilterSelect.value = "all";
  if (brandFilterSelect) brandFilterSelect.value = "all";
  syncModelOptionsWithBrand();
  if (ramFilterSelect) ramFilterSelect.value = "all";
  if (modelFilterSelect) modelFilterSelect.value = "all";
  statusRadioInputs.forEach((radio, idx) => {
    radio.checked = idx === 0;
  });
  if (duplicatesToggle) duplicatesToggle.checked = false;
  if (orphansToggle) orphansToggle.checked = false;

  currentPage = 1;
  currentSearch = "";
  currentOs = "all";
  currentOsVariant = "all";
  currentArch = "all";
  currentBrand = "all";
  currentRam = "all";
  currentModel = "all";
  currentStatus = "all";
  currentDuplicates = false;
  currentOrphans = false;

  fetchTerminals(true);
  onFiltersChangedCallback?.();
}

export function initTerminalsTable(onFiltersChanged?: () => void): void {
  onFiltersChangedCallback = onFiltersChanged ?? null;

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
  const duplicatesToggle = document.getElementById("filter-duplicates");
  const orphansToggle = document.getElementById("filter-orphans");
  const terminalsSentinel = document.getElementById(
    "scroll-sentinel-terminales",
  );
  const btnClearTerminales = document.getElementById(
    "btn-clear-filters-terminales",
  );
  const btnClearEmptyTerminales = document.getElementById(
    "btn-clear-empty-terminales",
  );
  const terminalTable = document.getElementById("table-terminales");

  currentSearch = terminalSearchInput?.value.trim() || "";
  currentOs = osFilterSelect?.value || "all";
  currentOsVariant = osVariantFilterSelect?.value || "all";
  currentArch = archFilterSelect?.value || "all";
  currentBrand = brandFilterSelect?.value || "all";
  currentRam = ramFilterSelect?.value || "all";
  currentModel = modelFilterSelect?.value || "all";
  currentStatus =
    statusRadioInputs.find((r) => r.checked)?.dataset.terminalStatus || "all";
  currentDuplicates = (duplicatesToggle as HTMLInputElement)?.checked ?? false;
  currentOrphans = (orphansToggle as HTMLInputElement)?.checked ?? false;
  hasMore = terminalsSentinel?.getAttribute("data-has-more") === "true";

  const osMapData = JSON.parse(
    document.getElementById("os-map-data")?.textContent || "{}",
  );

  osFilterSelect?.addEventListener("change", () => {
    if (osVariantFilterSelect) {
      const val = osFilterSelect.value;
      osVariantFilterSelect.innerHTML =
        '<option value="all">Variante (Todas)</option>';
      if (val === "all" || !osMapData[val] || osMapData[val].length === 0) {
        osVariantFilterSelect.disabled = true;
        osVariantFilterSelect.value = "all";
      } else {
        osVariantFilterSelect.disabled = false;
        osMapData[val].forEach((variant: string) => {
          const opt = document.createElement("option");
          opt.value = variant;
          opt.textContent = variant;
          osVariantFilterSelect.appendChild(opt);
        });
      }
    }
    triggerSearch();
  });

  osVariantFilterSelect?.addEventListener("change", triggerSearch);
  archFilterSelect?.addEventListener("change", triggerSearch);
  brandFilterSelect?.addEventListener("change", () => {
    syncModelOptionsWithBrand();
    triggerSearch();
  });
  ramFilterSelect?.addEventListener("change", triggerSearch);
  modelFilterSelect?.addEventListener("change", triggerSearch);
  statusRadioInputs.forEach((radio) =>
    radio.addEventListener("change", triggerSearch),
  );

  terminalSearchInput?.addEventListener("input", triggerSearch);
  duplicatesToggle?.addEventListener("change", triggerSearch);
  orphansToggle?.addEventListener("change", triggerSearch);

  btnClearTerminales?.addEventListener("click", resetTerminalFilters);
  btnClearEmptyTerminales?.addEventListener("click", resetTerminalFilters);

  if (terminalsSentinel) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          currentPage++;
          fetchTerminals(false);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(terminalsSentinel);
  }

  terminalTable?.addEventListener("table-sort-change", (e: any) => {
    const { sortKey, direction } = e.detail;
    currentSortBy = direction === "none" ? null : sortKey;
    currentSortOrder =
      direction === "ascending"
        ? "asc"
        : direction === "descending"
          ? "desc"
          : null;
    currentPage = 1;
    fetchTerminals(true, false);
    onFiltersChangedCallback?.();
  });
}
