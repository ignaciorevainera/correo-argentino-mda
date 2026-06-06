type SortDirection = "none" | "ascending" | "descending";
type MasterDetailView = "flat" | "grouped";

const SORT_DIRECTIONS: SortDirection[] = ["none", "ascending", "descending"];

const getBody = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>("[data-master-detail-table-body]");

const getItems = (body: HTMLElement): HTMLElement[] =>
  Array.from(
    body.querySelectorAll<HTMLElement>("[data-master-detail-sort-item]"),
  );

const getGroupHeaders = (body: HTMLElement): HTMLElement[] =>
  Array.from(
    body.querySelectorAll<HTMLElement>("[data-master-detail-group-header]"),
  );

const getSortValue = (item: HTMLElement, sortKey: string): string =>
  item.getAttribute(`data-sort-${sortKey}`)?.trim() ?? "";

const getOriginalIndex = (item: HTMLElement): number =>
  Number(item.dataset.masterDetailOriginalIndex ?? "0");

const getGroupOriginalIndex = (header: HTMLElement): number =>
  Number(header.dataset.masterDetailGroupOriginalIndex ?? "0");

const getGroupName = (item: HTMLElement): string =>
  item.dataset.sortGroup ?? item.dataset.masterDetailGroup ?? "";

const getHeaderGroupName = (header: HTMLElement): string =>
  header.dataset.masterDetailGroupHeader ?? header.dataset.locationGroup ?? "";

const ensureOriginalIndexes = (
  items: HTMLElement[],
  headers: HTMLElement[],
): void => {
  items.forEach((item, index) => {
    if (!item.dataset.masterDetailOriginalIndex) {
      item.dataset.masterDetailOriginalIndex = String(index);
    }
  });

  headers.forEach((header, index) => {
    if (!header.dataset.masterDetailGroupOriginalIndex) {
      header.dataset.masterDetailGroupOriginalIndex = String(index);
    }
  });
};

const compareItems = (
  firstItem: HTMLElement,
  secondItem: HTMLElement,
  sortKey: string,
  direction: SortDirection,
): number => {
  if (direction === "none" || !sortKey) {
    return getOriginalIndex(firstItem) - getOriginalIndex(secondItem);
  }

  const comparison = getSortValue(firstItem, sortKey).localeCompare(
    getSortValue(secondItem, sortKey),
    "es",
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (comparison === 0) {
    return getOriginalIndex(firstItem) - getOriginalIndex(secondItem);
  }

  return direction === "ascending" ? comparison : comparison * -1;
};

const sortItems = (
  items: HTMLElement[],
  sortKey: string,
  direction: SortDirection,
): HTMLElement[] =>
  [...items].sort((firstItem, secondItem) =>
    compareItems(firstItem, secondItem, sortKey, direction),
  );

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

const appendGroupedItems = (
  body: HTMLElement,
  headers: HTMLElement[],
  items: HTMLElement[],
  sortKey: string,
  direction: SortDirection,
): void => {
  const headersByGroup = new Map(
    headers.map((header) => [getHeaderGroupName(header), header]),
  );
  const groupNames = [
    ...new Set([
      ...headers
        .sort((firstHeader, secondHeader) =>
          getGroupOriginalIndex(firstHeader) -
          getGroupOriginalIndex(secondHeader),
        )
        .map(getHeaderGroupName),
      ...items.sort((firstItem, secondItem) =>
        getOriginalIndex(firstItem) - getOriginalIndex(secondItem),
      ).map(getGroupName),
    ]),
  ];

  groupNames.forEach((groupName) => {
    const header = headersByGroup.get(groupName);

    if (header) {
      body.append(header);
    }

    sortItems(
      items.filter((item) => getGroupName(item) === groupName),
      sortKey,
      direction,
    ).forEach((item) => {
      body.append(item);
    });
  });
};

const appendFlatItems = (
  body: HTMLElement,
  headers: HTMLElement[],
  items: HTMLElement[],
  sortKey: string,
  direction: SortDirection,
): void => {
  sortItems(items, sortKey, direction).forEach((item) => {
    body.append(item);
  });

  headers
    .sort(
      (firstHeader, secondHeader) =>
        getGroupOriginalIndex(firstHeader) - getGroupOriginalIndex(secondHeader),
    )
    .forEach((header) => {
      body.append(header);
    });
};

const arrangeRoot = (root: HTMLElement): void => {
  const body = getBody(root);

  if (!(body instanceof HTMLElement)) {
    return;
  }

  const items = getItems(body);
  const headers = getGroupHeaders(body);
  const sortKey = root.dataset.masterDetailSortKey ?? "";
  const direction = (root.dataset.masterDetailSortDirection ??
    "none") as SortDirection;
  const view = (root.dataset.masterDetailView ?? "flat") as MasterDetailView;

  ensureOriginalIndexes(items, headers);

  if (view === "grouped") {
    appendGroupedItems(body, headers, items, sortKey, direction);
    return;
  }

  appendFlatItems(body, headers, items, sortKey, direction);
};

const bindMasterDetailTableRoot = (root: HTMLElement): void => {
  if (root.dataset.masterDetailTableSortBound === "true") {
    return;
  }

  const body = getBody(root);

  if (!(body instanceof HTMLElement)) {
    return;
  }

  ensureOriginalIndexes(getItems(body), getGroupHeaders(body));
  root.dataset.masterDetailTableSortBound = "true";

  root.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
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
      root.dataset.masterDetailSortKey,
      root.dataset.masterDetailSortDirection,
      sortKey,
    );

    root.dataset.masterDetailSortKey = nextDirection === "none" ? "" : sortKey;
    root.dataset.masterDetailSortDirection = nextDirection;

    arrangeRoot(root);
    updateSortControls(root, sortKey, nextDirection);
  });
};

export const refreshMasterDetailTableSort = (
  root: ParentNode = document,
): void => {
  const tableRoots = Array.from(
    root.querySelectorAll<HTMLElement>("[data-master-detail-table-root]"),
  );

  tableRoots.forEach(arrangeRoot);
};

export const bindMasterDetailTableSort = (
  root: ParentNode = document,
): void => {
  const tableRoots = Array.from(
    root.querySelectorAll<HTMLElement>("[data-master-detail-table-root]"),
  );

  tableRoots.forEach((tableRoot) => {
    bindMasterDetailTableRoot(tableRoot);
    bindTableEmptyState(tableRoot);
  });
};

const bindTableEmptyState = (root: HTMLElement): void => {
  if (root.dataset.tableEmptyStateBound === "true") {
    return;
  }

  const body = getBody(root);
  const emptyState = root.querySelector<HTMLElement>("[data-table-empty-state-root]");
  const wrapper = root.querySelector<HTMLElement>("[data-master-detail-table-wrapper]");

  if (!body || !emptyState || !wrapper) {
    return;
  }

  const updateEmptyState = () => {
    const items = getItems(body);
    if (items.length === 0) return;

    const visibleItems = items.filter(item => !item.classList.contains("hidden"));
    const hasResults = visibleItems.length > 0;

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

