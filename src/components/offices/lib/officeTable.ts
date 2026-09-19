import { getBaseNoSlash } from "@lib/baseUrl";
import { highlightSearchTargets } from "@lib/clientSearch";
import { getFilterQueryParams, syncFiltersToURL } from "./officeFilters";

let currentPage = 1;
let currentSearch = "";
let isLoading = false;
let hasMore = false;
let currentSortBy: string | null = null;
let currentSortOrder: "asc" | "desc" | null = null;

export function getCurrentPage(): number {
  return currentPage;
}

export function resetPagination(): void {
  currentPage = 1;
}

export function getCurrentSearch(): string {
  return currentSearch;
}

export function setCurrentSearch(query: string): void {
  currentSearch = query;
}

export function getCurrentSort(): {
  sortBy: string | null;
  sortOrder: "asc" | "desc" | null;
} {
  return { sortBy: currentSortBy, sortOrder: currentSortOrder };
}

export function loadBranchPersonnel(detailRow: HTMLElement): void {
  const section = detailRow.querySelector<HTMLElement>(
    "[data-branch-personnel]",
  );
  if (!section) return;
  if (section.dataset.branchPersonnelLoaded === "true") return;
  section.dataset.branchPersonnelLoaded = "true";

  const nis = section.getAttribute("data-nis");
  const content = section.querySelector<HTMLElement>(
    "[data-branch-personnel-content]",
  );
  if (!nis || !content) return;

  const baseUrl = getBaseNoSlash();
  fetch(`${baseUrl}/api/offices/branch-personnel/${encodeURIComponent(nis)}`)
    .then((res) => {
      if (!res.ok) throw new Error("API error");
      return res.text();
    })
    .then((html) => {
      if (!html.trim()) {
        section.classList.add("hidden");
        return;
      }
      section.classList.remove("hidden");
      content.innerHTML = html;
    })
    .catch(() => {
      section.classList.remove("hidden");
      content.innerHTML =
        '<p class="text-xs text-error">Error al cargar personal</p>';
    });
}

export function loadTechnicalAssets(detailRow: HTMLElement): void {
  const section = detailRow.querySelector<HTMLElement>(
    "[data-office-assets-lazy]",
  );
  if (!section) return;
  if (section.dataset.assetsLoaded === "true") return;
  section.dataset.assetsLoaded = "true";

  const nis = section.getAttribute("data-nis");
  const content = section.querySelector<HTMLElement>(
    "[data-office-assets-content]",
  );
  if (!nis || !content) return;

  const baseUrl = getBaseNoSlash();
  fetch(`${baseUrl}/api/offices/assets/${encodeURIComponent(nis)}`)
    .then((res) => {
      if (!res.ok) throw new Error("API error");
      return res.text();
    })
    .then((html) => {
      if (!html.trim()) {
        section.classList.add("hidden");
        return;
      }
      section.classList.remove("hidden");
      content.innerHTML = html;
    })
    .catch(() => {
      section.classList.remove("hidden");
      content.innerHTML =
        '<p class="text-xs text-error">Error al cargar equipos</p>';
    });
}

export function bindRowEvents(parent: HTMLElement | Document = document): void {
  const toggleButtons = Array.from(
    parent.querySelectorAll<HTMLElement>("[data-chevron-toggle]"),
  );

  toggleButtons.forEach((btn) => {
    if (btn.dataset.eventsBound === "true") return;
    btn.dataset.eventsBound = "true";

    const masterRow = btn.closest<HTMLElement>("[data-office-master-row]");
    if (!masterRow) return;

    const officeId = masterRow.dataset.officeId ?? "";
    const detailRow = document.querySelector<HTMLElement>(
      `[data-office-detail-row][data-office-id="${officeId}"]`,
    );

    const toggleRow = (): void => {
      const isExpanded = masterRow.getAttribute("aria-expanded") === "true";
      const newExpanded = !isExpanded;

      if (newExpanded) {
        document
          .querySelectorAll<HTMLElement>(
            '[data-office-master-row][aria-expanded="true"]',
          )
          .forEach((row) => {
            if (row.dataset.officeId === officeId) return;
            const otherId = row.dataset.officeId ?? "";
            row.classList.remove("bg-base-200/70");
            row.setAttribute("aria-expanded", "false");
            row
              .querySelector<HTMLElement>("[data-chevron-open]")
              ?.classList.add("hidden");
            row
              .querySelector<HTMLElement>("[data-chevron-closed]")
              ?.classList.remove("hidden");
            document
              .querySelector<HTMLElement>(
                `[data-office-detail-row][data-office-id="${otherId}"]`,
              )
              ?.classList.add("hidden");
          });
      }

      masterRow.classList.toggle("bg-base-200/70", newExpanded);
      masterRow.setAttribute("aria-expanded", newExpanded ? "true" : "false");

      const openIcon = masterRow.querySelector<HTMLElement>(
        "[data-chevron-open]",
      );
      const closedIcon = masterRow.querySelector<HTMLElement>(
        "[data-chevron-closed]",
      );

      openIcon?.classList.toggle("hidden", !newExpanded);
      closedIcon?.classList.toggle("hidden", newExpanded);
      detailRow?.classList.toggle("hidden", !newExpanded);

      if (newExpanded && detailRow) {
        loadBranchPersonnel(detailRow);
        loadTechnicalAssets(detailRow);
      }
    };

    btn.addEventListener("click", toggleRow);
  });
}

export async function fetchOffices(
  isNewSearch: boolean,
  showLoadingUI = true,
): Promise<void> {
  if (isLoading) return;
  isLoading = true;

  const spinner = document.getElementById("loading-spinner");
  const sentinel = document.getElementById("scroll-sentinel");
  const tableRoot = document.querySelector<HTMLElement>(
    "[data-master-detail-table-root]",
  );
  const container = tableRoot?.querySelector<HTMLElement>(
    "[data-master-detail-table-body]",
  );
  const noResultsState = document.getElementById("no-results-state");

  if (showLoadingUI) {
    spinner?.classList.remove("hidden");
  }

  try {
    const query = getFilterQueryParams(
      currentPage,
      currentSearch,
      currentSortBy,
      currentSortOrder,
    );
    const baseUrl = getBaseNoSlash();
    const response = await fetch(`${baseUrl}/api/offices?${query}`);
    if (!response.ok) throw new Error("API call failed");

    const html = await response.text();
    hasMore = response.headers.get("X-Has-More") === "true";
    const totalCount = parseInt(
      response.headers.get("X-Total-Count") || "0",
      10,
    );

    const badgeText = document.getElementById("total-count-badge");
    if (badgeText) {
      badgeText.textContent = `${totalCount} resultados`;
    }

    if (container) {
      if (isNewSearch) {
        const oldItems = container.querySelectorAll(
          "[data-master-detail-sort-item], [data-office-detail-row]",
        );
        oldItems.forEach((el) => el.remove());
        container.insertAdjacentHTML("beforeend", html);
      } else {
        container.insertAdjacentHTML("beforeend", html);
      }
    }

    const tableContainer = document.getElementById("office-table-container");
    if (noResultsState && tableContainer) {
      if (totalCount === 0) {
        noResultsState.classList.remove("hidden");
        noResultsState.classList.add("flex");
        tableContainer.classList.add("hidden");
      } else {
        noResultsState.classList.add("hidden");
        noResultsState.classList.remove("flex");
        tableContainer.classList.remove("hidden");
      }
    }

    bindRowEvents(container || document);

    if (currentSearch && container) {
      const newArticles = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-master-detail-sort-item]",
        ),
      );
      newArticles.forEach((item) => {
        highlightSearchTargets(item, currentSearch);
      });
    }

    if (!hasMore) {
      sentinel?.classList.add("hidden");
    } else {
      sentinel?.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Error fetching offices:", err);
  } finally {
    isLoading = false;
    if (showLoadingUI) {
      spinner?.classList.add("hidden");
    }
  }
}

let isTableInitialized = false;
let sentinelObserver: IntersectionObserver | null = null;

export function initOfficeTable(): void {
  if (isTableInitialized) return;

  const tableRoot = document.querySelector<HTMLElement>(
    "[data-master-detail-table-root]",
  );
  if (!tableRoot) return;
  isTableInitialized = true;

  const sentinel = document.getElementById("scroll-sentinel");
  hasMore = sentinel?.getAttribute("data-has-more") === "true";

  const searchInput =
    document.querySelector<HTMLInputElement>("#office-search");
  currentSearch = searchInput?.value.trim() || "";

  const urlParams = new URLSearchParams(window.location.search);
  currentSortBy = urlParams.get("sortBy");
  currentSortOrder = (urlParams.get("sortOrder") as "asc" | "desc") || null;

  tableRoot.addEventListener("master-detail-sort-change", (e: any) => {
    const { sortKey, direction } = e.detail;
    currentSortBy = direction === "none" ? null : sortKey;
    currentSortOrder =
      direction === "ascending"
        ? "asc"
        : direction === "descending"
          ? "desc"
          : null;
    currentPage = 1;
    fetchOffices(true, false);
    syncFiltersToURL(currentSearch, currentSortBy, currentSortOrder);
  });

  if (currentSortBy) {
    const dir = currentSortOrder === "desc" ? "descending" : "ascending";
    tableRoot.dataset.masterDetailSortKey = currentSortBy;
    tableRoot.dataset.masterDetailSortDirection = dir;

    const control = tableRoot.querySelector(
      `[data-table-sort-key="${currentSortBy}"]`,
    );
    if (control) {
      control.setAttribute("data-table-sort-direction", dir);
      control.setAttribute("aria-sort", dir);
      control
        .querySelectorAll("[data-table-sort-icon]")
        .forEach((icon: any) => {
          const shouldShow = icon.dataset.tableSortIcon === dir;
          icon.classList.toggle("hidden", !shouldShow);
          icon.classList.toggle("opacity-0", !shouldShow);
        });
    }
  }

  if (sentinel) {
    if (sentinelObserver) {
      sentinelObserver.disconnect();
    }
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          currentPage++;
          fetchOffices(false);
        }
      },
      { rootMargin: "200px" },
    );
    sentinelObserver.observe(sentinel);
  }

  bindRowEvents();
}
