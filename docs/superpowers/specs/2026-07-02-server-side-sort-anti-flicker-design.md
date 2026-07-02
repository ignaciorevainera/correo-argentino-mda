# Server-Side Sorting Without UI Flicker

## Objective
Prevent the "flicker" effect that occurs in server-paginated tables (like Offices and Terminals) when a user clicks a sort header. Currently, the shared table script instantly sorts the visible DOM elements on the client side, while the page-specific script makes an asynchronous fetch to the server to get the globally sorted data, leading to a visual race condition. The solution should also hide loading spinners during the sort operation to maintain a seamless UX.

## Architecture & Components

### 1. `MasterDetailTable.astro` Component Update
- Add a new optional boolean prop: `serverSideSort` (default: `false`).
- If `serverSideSort` is true, inject a data attribute: `data-server-side-sort="true"` into the `<section data-master-detail-table-root>`.

### 2. `clientMasterDetailTableSort.ts` Logic Update
- Modify `bindMasterDetailTableRoot`:
  - Keep the logic that calculates `nextDirection`, updates `root.dataset.masterDetailSortKey` / `masterDetailSortDirection`, and updates the sort icons via `updateSortControls()`.
  - Check for `root.dataset.serverSideSort === "true"`.
  - If it is true, **skip calling `arrangeRoot(root)`**. This prevents the instant (and incorrect) DOM reordering.
  - Dispatch a new custom event: `master-detail-sort-change` on the `root` element. The event detail will contain the new `sortKey` and `direction`.

### 3. Page-Specific Scripts (`DirectorioContent.astro`, etc.)
- Remove the duplicated logic for managing sort icons (`updateSortIcons`), since `clientMasterDetailTableSort.ts` will reliably handle this visually.
- Update `fetchOffices` (or equivalent fetch function) to accept a parameter indicating whether to show the loading spinner: `fetchOffices(isNewSearch: boolean, showLoadingUI = true)`.
  - If `showLoadingUI` is false, the spinner will not be toggled, leaving the DOM untouched while fetching.
- Listen for the `master-detail-sort-change` custom event on the `tableRoot`.
- On this event:
  - Update local state (`currentSortBy`, `currentSortOrder`) to match the event's details.
  - Reset `currentPage = 1`.
  - Call `syncSortToURL()`.
  - Call `fetchOffices(true, false)` (isNewSearch = true, showLoadingUI = false) to fetch data without showing the spinner.

## Expected Behavior
When a user clicks a column header on a paginated table:
1. The column header immediately shows the new sort icon.
2. The table rows remain exactly as they were (no spinner, no client-side reordering).
3. The background fetch retrieves the correct sorted data from the server.
4. Once the fetch resolves, the table rows are instantly swapped out with the accurate server data.

## Verification
- Test sorting on a paginated table (Offices/Terminals) and confirm no flicker occurs.
- Test sorting on a fully client-side loaded table to confirm `arrangeRoot` still works properly for small datasets.
