# Filtro "Sin Domicilio" en Directorio de Oficinas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle filter in the office directory that shows only offices without an address (`address IS NULL OR address = ''`). The filter is visible only to admins and hides itself when zero offices match the criterion.

**Architecture:** The filter is a checkbox toggle (matching the existing "Depende de otra" / "Solo Cabeceras" pattern) in the `DirectorioContent.astro` form. The backend query in `officeQueries.ts` accepts a new `noAddress` boolean parameter. A pre-computed count of address-less offices determines whether the toggle should render at all.

**Tech Stack:** Astro SSR, Drizzle ORM (SQLite), Tailwind v4 + DaisyUI v5

---

### Task 1: Backend — Add `noAddress` filter to `getOffices()`

**Files:**
- Modify: `src/lib/officeQueries.ts:45-58` (interface), `src/lib/officeQueries.ts:206-213` (WHERE clauses)

- [ ] **Step 1: Add `noAddress` to the `GetOfficesParams` interface**

In `src/lib/officeQueries.ts`, add `noAddress` to the interface, after `isHeadquarter`:

```typescript
export interface GetOfficesParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  region?: string;
  province?: string;
  zone?: string;
  paqar?: string;
  hasParent?: boolean;
  isHeadquarter?: boolean;
  noAddress?: boolean;
  sortBy?: OfficeSortKey;
  sortOrder?: SortOrder;
}
```

- [ ] **Step 2: Add the `noAddress` WHERE clause in `getOffices()`**

In `src/lib/officeQueries.ts`, after the `isHeadquarter` block (after line 213), add:

```typescript
  // No address filter
  if (params.noAddress === true) {
    whereConditions.push(
      or(
        sql`${offices.address} IS NULL`,
        sql`${offices.address} = ''`,
      ),
    );
  }
```

Ensure `or` is already imported from `drizzle-orm` at the top of the file (it is — line 3).

---

### Task 2: API — Pass `noAddress` param to `getOffices()`

**Files:**
- Modify: `src/pages/api/offices/index.astro:10-44`

- [ ] **Step 1: Read the `noAddress` query parameter**

In `src/pages/api/offices/index.astro`, add after line 20 (`isHeadquarter` line):

```typescript
const noAddress = searchParams.get("noAddress") === "true";
```

- [ ] **Step 2: Pass `noAddress` to `getOffices()` call**

In the same file, add `noAddress` to the object passed to `getOffices()` (after `isHeadquarter`):

```typescript
const {
  data: offices,
  count,
  hasMore,
} = await getOffices({
  page,
  limit,
  search,
  type,
  region,
  province,
  zone,
  paqar,
  hasParent,
  isHeadquarter,
  noAddress,
  sortBy,
  sortOrder,
});
```

---

### Task 3: Frontend — Add toggle filter and conditional visibility

**Files:**
- Modify: `src/components/offices/DirectorioContent.astro:41-44` (param reading), `:99-100` (count query), `:179-191` (zone query, add count), `:192-195` (grid class), `:327-337` (toggle checkboxes)

- [ ] **Step 1: Read `noAddress` from URL params**

At `DirectorioContent.astro`, after line 44 (`isHeadquarterFilter`), add:

```typescript
const noAddressFilter = searchParams.get("noAddress") === "true";
```

- [ ] **Step 2: Query count of offices without address**

After the raw counts query block that populates `processedCounts` (around line 100-159), add a count query for offices without address:

In the `---` frontmatter section, after the `allZonesRaw` query (after line 190), add:

```typescript
const noAddressCount = await db
  .select({ count: sql<number>`count(*)` })
  .from(offices)
  .where(
    or(
      sql`${offices.address} IS NULL`,
      sql`${offices.address} = ''`,
    ),
  );
const hasNoAddressOffices = noAddressCount[0].count > 0;
```

You'll need to ensure `or` is already imported. Check the imports at line 23 — it imports `eq, sql` from `drizzle-orm`. Add `or`:

```typescript
import { eq, or, sql } from "drizzle-orm";
```

(Verify the import line — line 23 currently reads `import { eq, sql } from "drizzle-orm";`.)

- [ ] **Step 3: Render the "Sin Domicilio" toggle checkbox (admin-only, conditional)**

In the form's filter row, after the "Solo Cabeceras" toggle (after line 334), add the conditional toggle:

```astro
{
  isAllowedAdmin && hasNoAddressOffices && (
    <label class="label cursor-pointer gap-2 p-0">
      <span class="label-text font-medium text-base-content/80 text-xs sm:text-sm">Sin domicilio</span>
      <input type="checkbox" name="noAddress" value="true" class="toggle toggle-sm toggle-primary" checked={noAddressFilter} aria-label="Mostrar solo oficinas sin domicilio registrado" />
    </label>
  )
}
```

- [ ] **Step 4 (optional refinement): Shrink existing toggles container if needed**

The toggles are in a `<div class="flex items-center gap-4 px-2">` (line 327). This div will now contain 2 or 3 toggles. The existing flex layout handles wrapping and spacing automatically. No width change needed.

---

### Task 4: Client-side — Handle toggle changes and clear-filters

**Files:**
- Modify: `src/components/offices/DirectorioContent.astro:711-714` (toggle references), `:716-720` (event listeners), `:1273-1304` (clear filters)

- [ ] **Step 1: Bind the `noAddress` toggle in client JS**

After `isHeadquarterToggle` (line 711), add:

```javascript
const noAddressToggle = document.querySelector<HTMLInputElement>('input[name="noAddress"]');
```

- [ ] **Step 2: Attach change event listener**

After the `isHeadquarterToggle?.addEventListener` line (line 747), add:

```javascript
noAddressToggle?.addEventListener("change", handleFilterChange);
```

- [ ] **Step 3: Reset `noAddress` toggle in clear-filters handler**

In the `clearFiltersBtn` click handler, after the `isHeadquarterToggle` reset (line 1288), add:

```javascript
if (noAddressToggle) noAddressToggle.checked = false;
```

- [ ] **Step 4: Include `noAddress` in `getQueryParams()` and `syncFiltersToURL()`**

The `getQueryParams()` function already iterates `formData.entries()` which will include `noAddress` when checked (since checkboxes with `name` and `value` attributes are included in FormData when checked). No change needed here — it's automatic.

---

### Task 5: Verify — Rebuild and test

**Files:** None (verification only)

- [ ] **Step 1: Run build to verify no compilation errors**

```bash
npm run build
```
Expected: Build succeeds without errors.

- [ ] **Step 2: Start dev server and test manually**

```bash
npm run dev
```

Test scenarios:
1. Log in as admin → visit `/oficinas` → verify "Sin domicilio" toggle appears if there are offices without addresses
2. Toggle "Sin domicilio" → verify only offices without address are shown
3. Un-toggle → verify all offices shown again
4. Click "Limpiar filtros" → verify "Sin domicilio" toggle is cleared
5. If there are zero offices without addresses → verify "Sin domicilio" toggle does NOT render
6. Log in as non-admin → verify "Sin domicilio" toggle never renders

- [ ] **Step 3: Commit**

```bash
git add src/lib/officeQueries.ts src/pages/api/offices/index.astro src/components/offices/DirectorioContent.astro
git commit -m "feat(offices): add 'Sin Domicilio' filter toggle for admins, auto-hides when no matches"
```
