import { getBaseNoSlash } from "@lib/baseUrl";
import {
  buildQueryString,
  updateBrowserUrl,
  updateCsvExportHref,
} from "@lib/clientUrlSync";
export function getFilterQueryParams(
  pageNumber: number,
  currentSearch: string,
  currentSortBy: string | null = null,
  currentSortOrder: "asc" | "desc" | null = null,
): string {
  const form = document.getElementById(
    "office-filters-form",
  ) as HTMLFormElement | null;
  const params: Record<string, string | null | undefined> = {};

  if (form) {
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (value && value !== "all" && key !== "search") {
        params[key] = value.toString();
      }
    }
  }

  params.page = pageNumber.toString();
  params.limit = "100";

  if (currentSearch) {
    params.search = currentSearch;
  }
  if (currentSortBy) {
    params.sortBy = currentSortBy;
    if (currentSortOrder) params.sortOrder = currentSortOrder;
  }

  return buildQueryString(params);
}

export function syncFiltersToURL(
  currentSearch: string = "",
  currentSortBy: string | null = null,
  currentSortOrder: "asc" | "desc" | null = null,
): void {
  const form = document.getElementById(
    "office-filters-form",
  ) as HTMLFormElement | null;
  const params: Record<string, string | null | undefined> = {};

  if (form) {
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (value && value !== "all" && key !== "search") {
        params[key] = value.toString();
      }
    }
  }
  if (currentSearch) {
    params.search = currentSearch;
  }
  if (currentSortBy) {
    params.sortBy = currentSortBy;
    if (currentSortOrder) params.sortOrder = currentSortOrder;
  }

  const queryString = buildQueryString(params);
  updateBrowserUrl(queryString);

  const baseUrl = getBaseNoSlash();
  updateCsvExportHref(
    "export-csv-btn",
    `${baseUrl}/api/export/offices`,
    queryString,
  );
}

export function initOfficeFilters(
  onFilterChange: (newSearch?: string) => void,
): void {
  const form = document.getElementById(
    "office-filters-form",
  ) as HTMLFormElement | null;
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
  });

  const regionSelect = document.getElementById(
    "regionFilter",
  ) as HTMLSelectElement | null;
  const provinceSelect = document.getElementById(
    "provinceFilter",
  ) as HTMLSelectElement | null;
  const zoneSelect = document.getElementById(
    "zoneFilter",
  ) as HTMLSelectElement | null;
  const paqarSelect = document.getElementById(
    "paqarFilter",
  ) as HTMLSelectElement | null;
  const hasParentToggle = document.querySelector<HTMLInputElement>(
    'input[name="hasParent"]',
  );
  const isHeadquarterToggle = document.querySelector<HTMLInputElement>(
    'input[name="isHeadquarter"]',
  );
  const noAddressToggle = document.querySelector<HTMLInputElement>(
    'input[name="noAddress"]',
  );
  const statusToggle = document.querySelector<HTMLInputElement>(
    'input[name="status"]',
  );
  const typeSelect = document.getElementById(
    "typeFilter",
  ) as HTMLSelectElement | null;
  const searchInput =
    document.querySelector<HTMLInputElement>("#office-search");
  const clearFiltersBtn = document.getElementById("clear-filters-btn");
  const advancedCountEl = document.getElementById("advanced-filter-count");
  const advancedSummary = advancedCountEl?.closest("summary");

  const triggerChange = () => {
    onFilterChange();
  };

  const updateAdvancedCount = () => {
    const count =
      (zoneSelect?.value !== "all" ? 1 : 0) +
      (paqarSelect?.value !== "all" ? 1 : 0) +
      (hasParentToggle?.checked ? 1 : 0) +
      (noAddressToggle?.checked ? 1 : 0) +
      (statusToggle?.checked ? 1 : 0);

    if (advancedCountEl) {
      advancedCountEl.textContent = String(count);
      advancedCountEl.classList.toggle("hidden", count === 0);
    }
    if (advancedSummary) {
      advancedSummary.classList.toggle("btn-soft", count > 0);
      advancedSummary.classList.toggle("btn-primary", count > 0);
      advancedSummary.classList.toggle("btn-outline", count === 0);
      advancedSummary.setAttribute(
        "aria-label",
        count > 0
          ? `Filtros avanzados, ${count} activos`
          : "Filtros avanzados",
      );
    }
  };

  regionSelect?.addEventListener("change", () => {
    if (provinceSelect) provinceSelect.value = "all";
    triggerChange();
  });

  provinceSelect?.addEventListener("change", () => {
    if (regionSelect) regionSelect.value = "all";
    triggerChange();
  });
  typeSelect?.addEventListener("change", triggerChange);
  zoneSelect?.addEventListener("change", () => {
    updateAdvancedCount();
    triggerChange();
  });
  paqarSelect?.addEventListener("change", () => {
    updateAdvancedCount();
    triggerChange();
  });
  hasParentToggle?.addEventListener("change", () => {
    updateAdvancedCount();
    triggerChange();
  });
  isHeadquarterToggle?.addEventListener("change", triggerChange);
  noAddressToggle?.addEventListener("change", () => {
    updateAdvancedCount();
    triggerChange();
  });
  statusToggle?.addEventListener("change", () => {
    updateAdvancedCount();
    triggerChange();
  });

  updateAdvancedCount();

  let debounceTimeout: number;
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = window.setTimeout(() => {
      onFilterChange(searchInput.value.trim());
    }, 300);
  });

  clearFiltersBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";

    if (regionSelect) regionSelect.value = "all";
    if (provinceSelect) provinceSelect.value = "all";
    if (zoneSelect) zoneSelect.value = "all";
    if (paqarSelect) paqarSelect.value = "all";

    if (hasParentToggle) hasParentToggle.checked = false;
    if (isHeadquarterToggle) isHeadquarterToggle.checked = false;
    if (noAddressToggle) noAddressToggle.checked = false;
    if (statusToggle) statusToggle.checked = false;

    if (typeSelect) typeSelect.value = "all";

    updateAdvancedCount();
    onFilterChange("");
  });
}
