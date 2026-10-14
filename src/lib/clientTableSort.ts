type SortDirection = "none" | "ascending" | "descending";

const SORT_DIRECTIONS: SortDirection[] = ["none", "ascending", "descending"];

const getRows = (body: HTMLElement): HTMLElement[] =>
  Array.from(body.querySelectorAll<HTMLElement>("[data-table-row]")).filter(
    (row) => row.closest("[data-table-sort-body]") === body,
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
    row.parentElement?.append(row);
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

/**
 * Persistencia opcional del criterio elegido, por root. Se activa declarando
 * `data-table-sort-storage-key` en el root (el valor lo elige la pagina, que
 * suele incluir el usuario para que el orden no se comparta entre perfiles).
 */
const readStoredSort = (root: HTMLElement): [string, SortDirection] | null => {
  const storageKey = root.dataset.tableSortStorageKey?.trim();
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; direction?: string };
    const direction = parsed.direction as SortDirection;
    if (!parsed.key || (direction !== "ascending" && direction !== "descending")) {
      return null;
    }
    return [parsed.key, direction];
  } catch {
    return null;
  }
};

const writeStoredSort = (root: HTMLElement, key: string, direction: SortDirection): void => {
  const storageKey = root.dataset.tableSortStorageKey?.trim();
  if (!storageKey || key === "") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ key, direction }));
  } catch {
    // localStorage lleno o bloqueado: el orden sigue funcionando en memoria.
  }
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

  const defaultKey = root.dataset.tableSortDefaultKey?.trim();
  const defaultDirection = root.dataset
    .tableSortDefaultDirection as SortDirection | undefined;

  const stored = readStoredSort(root);
  if (stored) {
    sortRows(body, stored[0], stored[1]);
    updateSortControls(root, stored[0], stored[1]);
    root.dataset.tableSortKey = stored[0];
    root.dataset.tableSortDirection = stored[1];
  } else if (
    defaultKey &&
    (defaultDirection === "ascending" || defaultDirection === "descending")
  ) {
    sortRows(body, defaultKey, defaultDirection);
    updateSortControls(root, defaultKey, defaultDirection);
  }

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
    writeStoredSort(root, root.dataset.tableSortKey, nextDirection);

    if (root.dataset.serverSideSort === "true") {
      root.dispatchEvent(
        new CustomEvent("table-sort-change", {
          detail: { sortKey, direction: nextDirection },
          bubbles: true,
        }),
      );
    } else {
      sortRows(body, sortKey, nextDirection);
    }
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
  const emptyState = root.querySelector<HTMLElement>(
    "[data-table-empty-state-root]",
  );
  const wrapper = root.querySelector<HTMLElement>("[data-table-wrapper]");

  if (!body || !emptyState || !wrapper) {
    return;
  }

  const updateEmptyState = () => {
    const rows = getRows(body);
    // Las tablas cuyas filas no usan `data-table-row` siempre reportan 0 filas;
    // para ellas el empty state lo maneja el código de la página. Quien sí
    // renderiza `[data-table-row]` puede pedir que 0 filas muestre el estado
    // (incluso en el primer render, antes de que exista cualquier fila).
    const allowNoRows = root.dataset.tableWhenEmpty === "true";
    if (rows.length === 0 && !allowNoRows) return;

    const visibleRows = rows.filter((row) => !row.classList.contains("hidden"));
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
    // También filas insertadas/reemplazadas (p. ej. `container.innerHTML = html`
    // en búsquedas sin recargar): sin esto el estado no se actualizaba y quedaba
    // una cabecera sola.
    childList: true,
    subtree: true,
  });

  root.dataset.tableEmptyStateBound = "true";
  updateEmptyState();
};

export const initTableSortObserver = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  const observer = new MutationObserver(() => {
    bindClientTableSort();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  bindClientTableSort();
};
