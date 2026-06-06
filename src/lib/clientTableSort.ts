type SortDirection = "none" | "ascending" | "descending";

const SORT_DIRECTIONS: SortDirection[] = ["none", "ascending", "descending"];

const getRows = (body: HTMLElement): HTMLElement[] =>
  Array.from(body.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute("data-table-row"),
  );

const getSortValue = (row: HTMLElement, sortKey: string): string =>
  row.getAttribute(`data-sort-${sortKey}`)?.trim() ?? "";

const getOriginalIndex = (row: HTMLElement): number =>
  Number(row.dataset.tableOriginalIndex ?? "0");

const ensureOriginalIndexes = (rows: HTMLElement[]): void => {
  rows.forEach((row, index) => {
    if (!row.dataset.tableOriginalIndex) {
      row.dataset.tableOriginalIndex = String(index);
    }
  });
};

const getNextDirection = (
  currentKey: string | undefined,
  currentDirection: string | undefined,
  nextKey: string,
): SortDirection => {
  if (currentKey !== nextKey) {
    return "ascending";
  }

  const directionIndex = SORT_DIRECTIONS.indexOf(
    currentDirection as SortDirection,
  );

  return SORT_DIRECTIONS[(directionIndex + 1) % SORT_DIRECTIONS.length];
};

const updateSortControls = (
  root: HTMLElement,
  activeKey: string,
  direction: SortDirection,
): void => {
  const controls = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-table-sort-key]"),
  );

  controls.forEach((control) => {
    const isActive =
      control.dataset.tableSortKey === activeKey && direction !== "none";
    const controlDirection = isActive ? direction : "none";

    control.dataset.tableSortDirection = controlDirection;
    control.setAttribute("aria-sort", controlDirection);

    const icons = Array.from(
      control.querySelectorAll<HTMLElement>("[data-table-sort-icon]"),
    );

    icons.forEach((icon) => {
      const shouldShow = icon.dataset.tableSortIcon === controlDirection;

      icon.classList.toggle("hidden", !shouldShow);
      icon.classList.toggle("opacity-0", !shouldShow);
    });
  });
};

const sortRows = (
  body: HTMLElement,
  sortKey: string,
  direction: SortDirection,
): void => {
  const rows = getRows(body);
  ensureOriginalIndexes(rows);

  const sortedRows = [...rows].sort((firstRow, secondRow) => {
    if (direction === "none") {
      return getOriginalIndex(firstRow) - getOriginalIndex(secondRow);
    }

    const comparison = getSortValue(firstRow, sortKey).localeCompare(
      getSortValue(secondRow, sortKey),
      "es",
      {
        numeric: true,
        sensitivity: "base",
      },
    );

    if (comparison === 0) {
      return getOriginalIndex(firstRow) - getOriginalIndex(secondRow);
    }

    return direction === "ascending" ? comparison : comparison * -1;
  });

  sortedRows.forEach((row) => {
    body.append(row);
  });
};

const applyRowGridClass = (root: HTMLElement, rows: HTMLElement[]): void => {
  const rowGridClass = root.dataset.tableRowGridClass?.trim();

  if (!rowGridClass) {
    return;
  }

  const rowGridClasses = rowGridClass.split(/\s+/).filter(Boolean);

  if (rowGridClasses.length === 0) {
    return;
  }

  rows.forEach((row) => {
    row.classList.add(...rowGridClasses);
  });
};

const bindTableSortRoot = (root: HTMLElement): void => {
  if (root.dataset.tableSortBound === "true") {
    return;
  }

  const body = root.querySelector<HTMLElement>("[data-table-sort-body]");

  if (!(body instanceof HTMLElement)) {
    return;
  }

  const rows = getRows(body);
  ensureOriginalIndexes(rows);
  applyRowGridClass(root, rows);
  root.dataset.tableSortBound = "true";

  root.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (!target.closest("[data-table-header]")) {
      return;
    }

    const control = target.closest<HTMLButtonElement>("[data-table-sort-key]");

    if (!(control instanceof HTMLButtonElement)) {
      return;
    }

    const sortKey = control.dataset.tableSortKey;

    if (!sortKey) {
      return;
    }

    const nextDirection = getNextDirection(
      root.dataset.tableSortKey,
      root.dataset.tableSortDirection,
      sortKey,
    );

    root.dataset.tableSortKey = nextDirection === "none" ? "" : sortKey;
    root.dataset.tableSortDirection = nextDirection;

    sortRows(body, sortKey, nextDirection);
    updateSortControls(root, sortKey, nextDirection);
  });
};

export const bindClientTableSort = (root: ParentNode = document): void => {
  const tableRoots = Array.from(
    root.querySelectorAll<HTMLElement>("[data-table-sort-root]"),
  );

  tableRoots.forEach((tableRoot) => {
    bindTableSortRoot(tableRoot);
    bindTableEmptyState(tableRoot);
  });
};

const bindTableEmptyState = (root: HTMLElement): void => {
  if (root.dataset.tableEmptyStateBound === "true") {
    return;
  }

  const body = root.querySelector<HTMLElement>("[data-table-sort-body]");
  const emptyState = root.querySelector<HTMLElement>("[data-table-empty-state-root]");
  const wrapper = root.querySelector<HTMLElement>("[data-table-wrapper]");

  if (!body || !emptyState || !wrapper) {
    return;
  }

  const updateEmptyState = () => {
    const rows = getRows(body);
    if (rows.length === 0) return;

    const visibleRows = rows.filter(row => !row.classList.contains("hidden"));
    const hasResults = visibleRows.length > 0;

    wrapper.classList.toggle("hidden", !hasResults);
    emptyState.classList.toggle("hidden", hasResults);
    if (hasResults) {
      emptyState.classList.remove("flex");
    } else {
      emptyState.classList.add("flex");
    }
  };

  const observer = new MutationObserver(updateEmptyState);
  observer.observe(body, {
    attributes: true,
    attributeFilter: ["class"],
    subtree: true,
  });

  root.dataset.tableEmptyStateBound = "true";
  updateEmptyState();
};

