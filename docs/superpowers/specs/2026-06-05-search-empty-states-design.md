# Spec: Unified Search Empty States

Design specification for introducing a unified, styled empty state component (`SearchEmptyState`) and integrating it across all tables and search pages.

## Goal

Provide a visually rich and consistent experience when searches or filters return no results. The new component will replace the plain default text alerts with a premium card containing:
1. A visually distinct icon container with soft gradients and micro-animations.
2. A clear title (e.g. "No hay coincidencias" or "Sin resultados").
3. A customizable description guiding the user to try other terms.
4. An optional action button/link ("Limpiar filtros", "Restablecer búsqueda") to clear filters, which can either navigate to a reset URL or trigger client-side JavaScript.

---

## Component Architecture

We will create a new Astro component: `src/components/ui/SearchEmptyState.astro`.

### Props
- `id`: Unique identifier for DOM manipulation.
- `title`: Main header text (defaults to "Sin resultados").
- `description`: Guiding description text.
- `icon`: Icon name from `boxicons` pack (defaults to `"boxicons:search"`).
- `showClearButton`: Boolean indicating whether to render a reset button/link.
- `clearButtonText`: Label of the button (defaults to `"Restablecer búsqueda"`).
- `clearButtonId`: ID for the reset button, useful for JS event binding.
- `clearButtonHref`: URL path for link-based resets (if provided, renders as an anchor `<a>` instead of `<button>`).
- `class`: Additional CSS classes for styling or layout.

---

## Integration Plan

### 1. Table Components (`DataTable.astro` & `MasterDetailTable.astro`)
- We will modify `DataTable.astro` and `MasterDetailTable.astro` to:
  - Add optional props for customizing the empty state (title, description, button text/id/href).
  - Render `<SearchEmptyState>` inside the table component container but outside the main table wrapper/headers.
  - Automatically show/hide the table wrapper (headers and body) and the empty state via `clientTableSort.ts` / `clientMasterDetailTableSort.ts` when client-side filters result in 0 visible rows.

### 2. Public Directory Pages
- **Enlaces y Recursos (`enlaces-recursos/index.astro`)**:
  - Replace `important-links-empty` markup with `<SearchEmptyState>`.
- **Contactos (`contactos/index.astro`)**:
  - Replace `contacts-empty-state` markup with `<SearchEmptyState>`.
- **Directorio de Oficinas (`directorio-oficinas/index.astro`)**:
  - Replace `no-results-state` markup with `<SearchEmptyState>` containing a link-based reset button (`clearButtonHref`).
- **Guía de Soportes (`guia-soportes/index.astro`)**:
  - Replace `no-results-state` markup with `<SearchEmptyState>` containing a link-based reset button (`clearButtonHref`).
- **Inventario de Terminales (`inventario-equipos/index.astro`)**:
  - Integrate `<SearchEmptyState>` next to the `DataTable`.
  - Listen to row counts on search updates and show the empty state + hide the table if row count is 0.
  - Bind the reset button to programmatically click the main "Limpiar Filtros" button.

---

## Aesthetics & Styling
- The empty state will utilize the DaisyUI design tokens of the project (`bg-base-200/40`, `border-dashed`, `border-base-300`).
- The icon will be enclosed in a rounded, layered container with a blur background drop (`bg-primary/10`, `bg-secondary/15`, blur-md) and hover micro-animations (translating up, scales/pulses).
