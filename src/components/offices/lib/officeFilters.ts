import { getBaseNoSlash } from "@lib/baseUrl";
import {
  buildQueryString,
  updateBrowserUrl,
  updateCsvExportHref,
} from "@lib/clientUrlSync";
import { escapeHtml } from "@lib/sanitize";

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

  const provincesContainer = document.getElementById("provinces-data");
  let provincesByRegion: Record<string, { code: string; name: string }[]> = {};
  if (provincesContainer && provincesContainer.dataset.provinces) {
    try {
      provincesByRegion = JSON.parse(provincesContainer.dataset.provinces);
    } catch (e) {
      console.error("Error parsing provinces data", e);
    }
  }

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
  const typeHiddenInput = document.getElementById(
    "filter-tabs-hidden-type",
  ) as HTMLInputElement | null;
  const typeTabsContainer = document.querySelector(".filter-tabs-box");
  const searchInput =
    document.querySelector<HTMLInputElement>("#office-search");
  const clearFiltersBtn = document.getElementById("clear-filters-btn");

  const triggerChange = () => {
    onFilterChange();
  };

  regionSelect?.addEventListener("change", () => {
    const region = regionSelect.value;
    if (provinceSelect) {
      if (region === "all") {
        provinceSelect.value = "all";
        provinceSelect.disabled = true;
        provinceSelect.innerHTML =
          '<option value="all">Provincias (Todas)</option>';
      } else {
        provinceSelect.disabled = false;
        const regionProvinces = provincesByRegion[region] || [];
        let htmlOptions = '<option value="all">Provincias (Todas)</option>';
        regionProvinces.forEach((p) => {
          htmlOptions += `<option value="${p.code}">${escapeHtml(p.name)}</option>`;
        });
        provinceSelect.innerHTML = htmlOptions;
        provinceSelect.value = "all";
      }
    }
    triggerChange();
  });

  provinceSelect?.addEventListener("change", triggerChange);
  zoneSelect?.addEventListener("change", triggerChange);
  paqarSelect?.addEventListener("change", triggerChange);
  hasParentToggle?.addEventListener("change", triggerChange);
  isHeadquarterToggle?.addEventListener("change", triggerChange);
  noAddressToggle?.addEventListener("change", triggerChange);
  statusToggle?.addEventListener("change", triggerChange);

  if (typeTabsContainer) {
    const tabButtons =
      typeTabsContainer.querySelectorAll<HTMLButtonElement>(
        'button[role="tab"]',
      );
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-tab-value") || "all";
        if (typeHiddenInput) {
          typeHiddenInput.value = val;
        }

        tabButtons.forEach((b) => {
          b.setAttribute("aria-selected", "false");
          b.classList.remove("tab-active");
        });
        btn.setAttribute("aria-selected", "true");
        btn.classList.add("tab-active");

        triggerChange();
      });
    });
  }

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
    if (provinceSelect) {
      provinceSelect.innerHTML =
        '<option value="all">Provincias (Todas)</option>';
      provinceSelect.value = "all";
      provinceSelect.disabled = true;
    }
    if (zoneSelect) zoneSelect.value = "all";
    if (paqarSelect) paqarSelect.value = "all";

    if (hasParentToggle) hasParentToggle.checked = false;
    if (isHeadquarterToggle) isHeadquarterToggle.checked = false;
    if (noAddressToggle) noAddressToggle.checked = false;
    if (statusToggle) statusToggle.checked = false;

    if (typeHiddenInput) typeHiddenInput.value = "all";
    if (typeTabsContainer) {
      const tabButtons =
        typeTabsContainer.querySelectorAll<HTMLButtonElement>(
          'button[role="tab"]',
        );
      tabButtons.forEach((b) => {
        b.setAttribute("aria-selected", "false");
        b.classList.remove("tab-active");
        if (
          b.getAttribute("data-tab-value") === "all" ||
          (!b.getAttribute("data-tab-value") &&
            b.textContent?.trim() === "Todas")
        ) {
          b.setAttribute("aria-selected", "true");
          b.classList.add("tab-active");
        }
      });
    }

    onFilterChange("");
  });
}
