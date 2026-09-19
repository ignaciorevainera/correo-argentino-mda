import { highlightSearchTargets, matchesSearchQuery } from "@lib/clientSearch";

let selectedCubicFilter = "all";

export function bindSorting(tableId: string, rows: HTMLElement[]): void {
  const table = document.getElementById(tableId);
  if (!table || rows.length === 0) return;

  const headerCells = table.querySelectorAll("[data-table-sort-key]");
  let currentSortColumn: string | null = null;
  let currentSortDirection: "asc" | "desc" | null = null;

  table.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      "button[data-table-sort-key]",
    );
    if (!btn) return;

    const key = (btn as HTMLElement).dataset.tableSortKey;
    if (!key) return;

    if (currentSortColumn === key) {
      if (currentSortDirection === "asc") {
        currentSortDirection = "desc";
      } else {
        currentSortColumn = null;
        currentSortDirection = null;
      }
    } else {
      currentSortColumn = key;
      currentSortDirection = "asc";
    }

    headerCells.forEach((cell) => {
      const cellKey = (cell as HTMLElement).dataset.tableSortKey;
      const isActive = cellKey === currentSortColumn;
      const direction = isActive
        ? currentSortDirection === "asc"
          ? "ascending"
          : "descending"
        : "none";

      (cell as HTMLElement).dataset.tableSortDirection = direction;
      cell.setAttribute("aria-sort", direction);

      const icons = cell.querySelectorAll("[data-table-sort-icon]");
      icons.forEach((icon) => {
        const shouldShow =
          (icon as HTMLElement).dataset.tableSortIcon === direction;
        (icon as HTMLElement).classList.toggle("hidden", !shouldShow);
        (icon as HTMLElement).classList.toggle("opacity-0", !shouldShow);
      });
    });

    if (currentSortColumn) {
      const dataKey = `sort${currentSortColumn.charAt(0).toUpperCase()}${currentSortColumn.slice(1)}`;
      rows.sort((a, b) => {
        const valA = a.dataset[dataKey] || "";
        const valB = b.dataset[dataKey] || "";

        if (currentSortColumn === "ip") {
          const aParts = valA.split(".").map(Number);
          const bParts = valB.split(".").map(Number);
          for (let i = 0; i < 4; i++) {
            const numA = aParts[i] || 0;
            const numB = bParts[i] || 0;
            if (numA !== numB) {
              return currentSortDirection === "asc"
                ? numA - numB
                : numB - numA;
            }
          }
          return 0;
        }

        const valALower = valA.toLowerCase();
        const valBLower = valB.toLowerCase();

        if (valALower < valBLower)
          return currentSortDirection === "asc" ? -1 : 1;
        if (valALower > valBLower)
          return currentSortDirection === "asc" ? 1 : -1;
        return 0;
      });

      const parent = rows[0].parentElement;
      if (parent) {
        rows.forEach((row) => parent.appendChild(row));
      }
    }
  });
}

export function updateMachineRows(): void {
  const machineSearchInput =
    document.querySelector<HTMLInputElement>("#machine-search");
  const machineRows = Array.from(
    document.querySelectorAll<HTMLElement>("[data-machine-row]"),
  );

  if (!machineSearchInput) return;
  const query = machineSearchInput.value.trim();

  machineRows.forEach((row) => {
    const status = row.dataset.status ?? "";
    const matchesSearch = matchesSearchQuery(query, [
      row.dataset.name,
      row.dataset.ip,
      row.dataset.agent,
    ]);
    const matchesFilter =
      selectedCubicFilter === "all" || status === selectedCubicFilter;

    const isVisible = matchesSearch && matchesFilter;
    row.classList.toggle("hidden", !isVisible);
    highlightSearchTargets(row, isVisible ? query : "");
  });
}

export function initCubicsLive(): void {
  const machineSearchInput =
    document.querySelector<HTMLInputElement>("#machine-search");
  const filterTabs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-filter-tab]"),
  );
  const machineRows = Array.from(
    document.querySelectorAll<HTMLElement>("[data-machine-row]"),
  );
  const btnClearCubics = document.getElementById("btn-clear-filters-cubics");

  machineSearchInput?.addEventListener("input", updateMachineRows);
  filterTabs.forEach((tab) => {
    tab.addEventListener("change", () => {
      if (tab.checked) {
        selectedCubicFilter = tab.dataset.filter ?? "all";
        updateMachineRows();
      }
    });
  });

  btnClearCubics?.addEventListener("click", () => {
    if (machineSearchInput) machineSearchInput.value = "";
    filterTabs.forEach((tab, idx) => {
      tab.checked = idx === 0;
    });
    selectedCubicFilter = "all";
    updateMachineRows();
  });

  bindSorting("table-cubics", machineRows);
  updateMachineRows();
}
