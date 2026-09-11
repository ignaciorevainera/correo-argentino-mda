import { highlightSearchTargets } from "@lib/clientSearch";
import { escapeHtml } from "@lib/sanitize";
import { getCleanBase } from "@lib/baseUrl";
import type { MediterraneaFilterState, SortDirection } from "./types";

let mediCurrentPage = 1;
let mediCurrentSearch = "";
let mediCurrentType = "all";
let mediCurrentStatus = "all";
let mediHasMore = false;
let mediIsLoading = false;
let currentSortBy: string | null = null;
let currentSortOrder: SortDirection | null = null;

let mediDebounceTimeout: number | undefined;
let onFiltersChangedCallback: (() => void) | null = null;

export function getMediFilters(): MediterraneaFilterState {
  return {
    search: mediCurrentSearch,
    mediterraneaType: mediCurrentType,
    status: mediCurrentStatus,
  };
}

export function getMediSort(): {
  sortBy: string | null;
  sortOrder: SortDirection | null;
} {
  return { sortBy: currentSortBy, sortOrder: currentSortOrder };
}

export function setMediSort(
  sortBy: string | null,
  sortOrder: SortDirection | null,
): void {
  currentSortBy = sortBy;
  currentSortOrder = sortOrder;
}

export async function fetchMediterranea(
  isNewSearch: boolean,
  showLoadingUI = true,
): Promise<void> {
  const mediSentinel = document.getElementById("scroll-sentinel-mediterranea");
  const mediSpinner = document.getElementById("loading-spinner-mediterranea");
  const mediContainer = document.getElementById("table-mediterranea-body");
  const mediTotalCountBadge = document.getElementById(
    "total-count-badge-mediterranea",
  );

  if (mediIsLoading) return;
  mediIsLoading = true;
  if (showLoadingUI) mediSpinner?.classList.remove("hidden");

  try {
    const params = new URLSearchParams();
    params.set("isMediterranea", "true");
    params.set("page", mediCurrentPage.toString());
    params.set("limit", "50");
    if (mediCurrentSearch) params.set("search", mediCurrentSearch);
    if (mediCurrentType && mediCurrentType !== "all") {
      params.set("mediterraneaType", mediCurrentType);
    }
    if (mediCurrentStatus && mediCurrentStatus !== "all") {
      params.set("status", mediCurrentStatus);
    }
    if (currentSortBy) {
      params.set("sortBy", currentSortBy);
      if (currentSortOrder) params.set("sortOrder", currentSortOrder);
    }

    const cleanBase = getCleanBase();
    const response = await fetch(`${cleanBase}api/terminals?${params.toString()}`);
    if (!response.ok) throw new Error("API call failed");

    const html = await response.text();
    mediHasMore = response.headers.get("X-Has-More") === "true";
    const totalCount = response.headers.get("X-Total-Count") || "0";

    if (mediTotalCountBadge) {
      mediTotalCountBadge.textContent = `${totalCount} resultados`;
    }

    if (mediContainer) {
      if (isNewSearch) {
        mediContainer.innerHTML = html;
      } else {
        mediContainer.insertAdjacentHTML("beforeend", html);
      }

      mediContainer
        .querySelectorAll("[data-medi-group-header]")
        .forEach((el) => el.remove());
      const rows = Array.from(
        mediContainer.querySelectorAll<HTMLElement>("[data-terminal-row]"),
      );

      let currentNis = "";
      let currentGroupRows: HTMLElement[] = [];
      const groups: {
        nis: string;
        branch: string;
        region: string;
        rows: HTMLElement[];
      }[] = [];

      const extractNisFromHostname = (hostname: string): string => {
        const match = hostname.match(/MEDI\d{2}(.+)/i);
        return match ? match[1] : "";
      };

      rows.forEach((row) => {
        const hostname = row.getAttribute("data-hostname") || "";
        const nis = extractNisFromHostname(hostname);
        if (nis !== currentNis) {
          if (currentGroupRows.length > 0) {
            groups.push({
              nis: currentNis,
              branch: currentGroupRows[0].getAttribute("data-branch") || "",
              region: currentGroupRows[0].getAttribute("data-region") || "",
              rows: currentGroupRows,
            });
          }
          currentNis = nis;
          currentGroupRows = [row];
        } else {
          currentGroupRows.push(row);
        }
      });

      if (currentGroupRows.length > 0) {
        groups.push({
          nis: currentNis,
          branch: currentGroupRows[0].getAttribute("data-branch") || "",
          region: currentGroupRows[0].getAttribute("data-region") || "",
          rows: currentGroupRows,
        });
      }

      groups.forEach((group) => {
        const firstRow = group.rows[0];
        const groupHeader = document.createElement("div");
        groupHeader.className =
          "col-span-full bg-base-200 border-b border-base-300 px-4 py-2 flex items-center justify-between";
        groupHeader.setAttribute("data-medi-group-header", "true");

        const countText =
          group.rows.length === 1
            ? "1 equipo"
            : `${group.rows.length} equipos`;
        const regionMarkup =
          group.region && group.region !== "--"
            ? `
            <span class="text-xs text-base-content/40">•</span>
            <span class="text-xs text-base-content/50 font-normal uppercase tracking-wider">${escapeHtml(group.region)}</span>
          `
            : "";

        groupHeader.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="font-semibold text-sm text-base-content">${escapeHtml(group.branch)}</span>
            <div class="badge badge-sm badge-soft font-mono text-xs">${escapeHtml(group.nis)}</div>
            ${regionMarkup}
          </div>
          <span class="badge badge-neutral badge-sm font-medium">${escapeHtml(countText)}</span>
        `;

        firstRow.parentNode?.insertBefore(groupHeader, firstRow);
      });
    }

    const rowCount =
      mediContainer?.querySelectorAll("[data-terminal-row]").length ?? 0;
    const noResultsState = document.getElementById(
      "no-results-state-mediterranea",
    );
    const tableWrapper = document.getElementById(
      "mediterranea-table-wrapper",
    );

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

    if (mediCurrentSearch && mediContainer) {
      const newArticles = Array.from(
        mediContainer.querySelectorAll<HTMLElement>("[data-terminal-row]"),
      );
      newArticles.forEach((item) => {
        highlightSearchTargets(item, mediCurrentSearch);
      });
    }

    if (!mediHasMore) {
      mediSentinel?.classList.add("hidden");
    } else {
      mediSentinel?.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Error fetching Mediterránea:", err);
  } finally {
    mediIsLoading = false;
    if (showLoadingUI) mediSpinner?.classList.add("hidden");
  }
}

export function triggerMediSearch(): void {
  window.clearTimeout(mediDebounceTimeout);
  mediDebounceTimeout = window.setTimeout(() => {
    const mediSearchInput =
      document.querySelector<HTMLInputElement>("#medi-search");
    const mediTypeSelect =
      document.querySelector<HTMLSelectElement>("#filter-medi-type");
    const mediStatusRadioInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-medi-status]"),
    );

    mediCurrentPage = 1;
    mediCurrentSearch = mediSearchInput?.value.trim() || "";
    mediCurrentType = mediTypeSelect?.value || "all";
    mediCurrentStatus =
      mediStatusRadioInputs.find((r) => r.checked)?.dataset.mediStatus || "all";

    fetchMediterranea(true);
    onFiltersChangedCallback?.();
  }, 300);
}

export function resetMediFilters(): void {
  const mediSearchInput =
    document.querySelector<HTMLInputElement>("#medi-search");
  const mediTypeSelect =
    document.querySelector<HTMLSelectElement>("#filter-medi-type");
  const mediStatusRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-medi-status]"),
  );

  if (mediSearchInput) mediSearchInput.value = "";
  if (mediTypeSelect) mediTypeSelect.value = "all";
  mediStatusRadioInputs.forEach((radio, idx) => {
    radio.checked = idx === 0;
  });

  mediCurrentPage = 1;
  mediCurrentSearch = "";
  mediCurrentType = "all";
  mediCurrentStatus = "all";

  fetchMediterranea(true);
  onFiltersChangedCallback?.();
}

export function initMediterraneaTable(onFiltersChanged?: () => void): void {
  onFiltersChangedCallback = onFiltersChanged ?? null;

  const mediSearchInput =
    document.querySelector<HTMLInputElement>("#medi-search");
  const mediTypeSelect =
    document.querySelector<HTMLSelectElement>("#filter-medi-type");
  const mediStatusRadioInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-medi-status]"),
  );
  const mediSentinel = document.getElementById("scroll-sentinel-mediterranea");
  const btnClearMedi = document.getElementById("btn-clear-filters-medi");
  const btnClearEmptyMedi = document.getElementById(
    "btn-clear-empty-mediterranea",
  );
  const mediterraneaTable = document.getElementById("table-mediterranea");

  mediCurrentSearch = mediSearchInput?.value.trim() || "";
  mediCurrentType = mediTypeSelect?.value || "all";
  mediCurrentStatus =
    mediStatusRadioInputs.find((r) => r.checked)?.dataset.mediStatus || "all";

  mediSearchInput?.addEventListener("input", triggerMediSearch);
  mediTypeSelect?.addEventListener("change", triggerMediSearch);
  mediStatusRadioInputs.forEach((radio) =>
    radio.addEventListener("change", triggerMediSearch),
  );

  btnClearMedi?.addEventListener("click", resetMediFilters);
  btnClearEmptyMedi?.addEventListener("click", resetMediFilters);

  if (mediSentinel) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !mediIsLoading && mediHasMore) {
          mediCurrentPage++;
          fetchMediterranea(false);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(mediSentinel);
  }

  mediterraneaTable?.addEventListener("table-sort-change", (e: any) => {
    const { sortKey, direction } = e.detail;
    currentSortBy = direction === "none" ? null : sortKey;
    currentSortOrder =
      direction === "ascending"
        ? "asc"
        : direction === "descending"
          ? "desc"
          : null;
    mediCurrentPage = 1;
    fetchMediterranea(true, false);
    onFiltersChangedCallback?.();
  });
}
