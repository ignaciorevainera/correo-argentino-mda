import { highlightSearchTargets } from "@lib/clientSearch";
import { getCleanBase } from "@lib/baseUrl";
import type { TTSTSFilterState, SortDirection } from "./types";

let ttCurrentPage = 1;
let ttCurrentSearch = "";
let ttCurrentStatus = "all";
let ttCurrentType = "all";
let ttCurrentVm = "all";
let ttHasMore = false;
let ttIsLoading = false;
let currentSortBy: string | null = null;
let currentSortOrder: SortDirection | null = null;

let ttDebounceTimeout: number | undefined;
let onFiltersChangedCallback: (() => void) | null = null;

export function getTTFilters(): TTSTSFilterState {
  return {
    search: ttCurrentSearch,
    status: ttCurrentStatus,
    ttType: ttCurrentType,
    vmFilter: ttCurrentVm,
  };
}

export function getTTSort(): {
  sortBy: string | null;
  sortOrder: SortDirection | null;
} {
  return { sortBy: currentSortBy, sortOrder: currentSortOrder };
}

export function setTTSort(
  sortBy: string | null,
  sortOrder: SortDirection | null,
): void {
  currentSortBy = sortBy;
  currentSortOrder = sortOrder;
}

export function syncTtVmFilterVisibility(): void {
  const ttVmFilterWrapper = document.getElementById("tt-vm-filter-wrapper");
  const ttVmRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-tt-vm]"),
  );
  if (!ttVmFilterWrapper) return;

  if (ttCurrentType === "tyt") {
    ttVmFilterWrapper.classList.remove("hidden");
  } else {
    ttVmFilterWrapper.classList.add("hidden");
    ttVmRadioInputs.forEach((radio, idx) => {
      radio.checked = idx === 0;
    });
    ttCurrentVm = "all";
  }
}

export async function fetchTT(
  isNewSearch: boolean,
  showLoadingUI = true,
): Promise<void> {
  const ttSentinel = document.getElementById("scroll-sentinel-ttsts");
  const ttSpinner = document.getElementById("loading-spinner-ttsts");
  const ttContainer = document.getElementById("table-ttsts-body");
  const ttTotalCountBadge = document.getElementById("total-count-badge-ttsts");

  if (ttIsLoading) return;
  ttIsLoading = true;
  if (showLoadingUI) ttSpinner?.classList.remove("hidden");

  try {
    const params = new URLSearchParams();
    params.set("isTT", "true");
    params.set("page", ttCurrentPage.toString());
    params.set("limit", "50");
    if (ttCurrentSearch) params.set("search", ttCurrentSearch);
    if (ttCurrentStatus && ttCurrentStatus !== "all") {
      params.set("status", ttCurrentStatus);
    }
    if (ttCurrentType && ttCurrentType !== "all") {
      params.set("ttType", ttCurrentType);
    }
    if (ttCurrentVm && ttCurrentVm !== "all") {
      params.set("vmFilter", ttCurrentVm);
    }
    if (currentSortBy) {
      params.set("sortBy", currentSortBy);
      if (currentSortOrder) params.set("sortOrder", currentSortOrder);
    }

    const cleanBase = getCleanBase();
    const response = await fetch(`${cleanBase}api/terminals?${params.toString()}`);
    if (!response.ok) throw new Error("API call failed");

    const html = await response.text();
    ttHasMore = response.headers.get("X-Has-More") === "true";
    const totalCount = response.headers.get("X-Total-Count") || "0";

    if (ttTotalCountBadge) {
      ttTotalCountBadge.textContent = `${totalCount} equipos`;
    }

    if (ttContainer) {
      if (isNewSearch) {
        ttContainer.innerHTML = html;
      } else {
        ttContainer.insertAdjacentHTML("beforeend", html);
      }
    }

    const rowCount =
      ttContainer?.querySelectorAll("[data-terminal-row]").length ?? 0;
    const noResultsState = document.getElementById("no-results-state-ttsts");
    const tableWrapper = document.getElementById("ttsts-table-wrapper");

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

    if (ttCurrentSearch && ttContainer) {
      const newArticles = Array.from(
        ttContainer.querySelectorAll<HTMLElement>("[data-terminal-row]"),
      );
      newArticles.forEach((item) => {
        highlightSearchTargets(item, ttCurrentSearch);
      });
    }

    if (!ttHasMore) {
      ttSentinel?.classList.add("hidden");
    } else {
      ttSentinel?.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Error fetching T&T & STS:", err);
  } finally {
    ttIsLoading = false;
    if (showLoadingUI) ttSpinner?.classList.add("hidden");
  }
}

export function triggerTTSearch(): void {
  window.clearTimeout(ttDebounceTimeout);
  ttDebounceTimeout = window.setTimeout(() => {
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

    ttCurrentPage = 1;
    ttCurrentSearch = ttSearchInput?.value.trim() || "";
    ttCurrentStatus =
      ttStatusRadioInputs.find((r) => r.checked)?.dataset.ttStatus || "all";
    ttCurrentType =
      ttTypeRadioInputs.find((r) => r.checked)?.dataset.ttType || "all";
    ttCurrentVm =
      ttVmRadioInputs.find((r) => r.checked)?.dataset.ttVm || "all";

    syncTtVmFilterVisibility();
    fetchTT(true);
    onFiltersChangedCallback?.();
  }, 300);
}

export function resetTTFilters(): void {
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

  if (ttSearchInput) ttSearchInput.value = "";
  ttStatusRadioInputs.forEach((radio, idx) => {
    radio.checked = idx === 0;
  });
  ttTypeRadioInputs.forEach((radio, idx) => {
    radio.checked = idx === 0;
  });
  ttVmRadioInputs.forEach((radio, idx) => {
    radio.checked = idx === 0;
  });

  ttCurrentPage = 1;
  ttCurrentSearch = "";
  ttCurrentStatus = "all";
  ttCurrentType = "all";
  ttCurrentVm = "all";

  syncTtVmFilterVisibility();
  fetchTT(true);
  onFiltersChangedCallback?.();
}

export function initTtstsTable(onFiltersChanged?: () => void): void {
  onFiltersChangedCallback = onFiltersChanged ?? null;

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
  const ttSentinel = document.getElementById("scroll-sentinel-ttsts");
  const btnClearTT = document.getElementById("btn-clear-filters-ttsts");
  const btnClearEmptyTT = document.getElementById("btn-clear-empty-ttsts");
  const ttTable = document.getElementById("table-ttsts");

  ttCurrentSearch = ttSearchInput?.value.trim() || "";
  ttCurrentStatus =
    ttStatusRadioInputs.find((r) => r.checked)?.dataset.ttStatus || "all";
  ttCurrentType =
    ttTypeRadioInputs.find((r) => r.checked)?.dataset.ttType || "all";
  ttCurrentVm =
    ttVmRadioInputs.find((r) => r.checked)?.dataset.ttVm || "all";

  ttSearchInput?.addEventListener("input", triggerTTSearch);
  ttStatusRadioInputs.forEach((radio) =>
    radio.addEventListener("change", triggerTTSearch),
  );
  ttTypeRadioInputs.forEach((radio) =>
    radio.addEventListener("change", triggerTTSearch),
  );
  ttVmRadioInputs.forEach((radio) =>
    radio.addEventListener("change", triggerTTSearch),
  );

  btnClearTT?.addEventListener("click", resetTTFilters);
  btnClearEmptyTT?.addEventListener("click", resetTTFilters);

  if (ttSentinel) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !ttIsLoading && ttHasMore) {
          ttCurrentPage++;
          fetchTT(false);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ttSentinel);
  }

  ttTable?.addEventListener("table-sort-change", (e: any) => {
    const { sortKey, direction } = e.detail;
    currentSortBy = direction === "none" ? null : sortKey;
    currentSortOrder =
      direction === "ascending"
        ? "asc"
        : direction === "descending"
          ? "desc"
          : null;
    ttCurrentPage = 1;
    fetchTT(true, false);
    onFiltersChangedCallback?.();
  });
}
