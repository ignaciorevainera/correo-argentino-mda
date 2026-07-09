# Datos InvGate en Detalle Expandible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show InvGate data (CP, CC, address, display name, parent) inside the expandable detail panel of each linked office row, using the same visual pattern as existing Contactos/Información sections.

**Architecture:** Add `invgateParentName` to the `office_invgate_links` table since the sync already resolves it but doesn't store it. Expose all InvGate fields through `OfficeDirectoryItem` type and `getOffices()` query. Add a "Datos InvGate" section in `OfficeRow.astro`'s detail panel, conditionally rendered when the office has a link.

**Tech Stack:** Astro SSR, Drizzle ORM, DaisyUI 5, existing expandable panel pattern

**Spec:** `docs/superpowers/specs/2026-07-07-integracion-oficinas-invgate-design.md` (secciones 3.3 y 3.5)

---

## File map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/db/schema.ts` | Add `invgateParentName` column |
| Modify | `src/lib/invgate/officeLinkSync.ts` | Store parent name on upsert |
| Modify | `src/types/offices.ts` | Add invgate fields to `OfficeDirectoryItem` |
| Modify | `src/lib/officeQueries.ts` | Map invgate fields in `getOffices()` |
| Modify | `src/components/offices/OfficeRow.astro` | Add "Datos InvGate" section in detail panel |

---

### Task 1: Add `invgateParentName` column to schema

**Files:**
- Modify: `src/db/schema.ts`

The sync function already resolves the parent name (`resolveParentName()`) but doesn't store it. Add the column so it can be stored and later displayed.

- [ ] **Step 1: Add column definition**

Find the `officeInvgateLinks` table definition (around line 178 in schema.ts). Add `invgateParentName` after `invgateParentId`:

```typescript
export const officeInvgateLinks = sqliteTable("office_invgate_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  officeId: integer("office_id")
    .notNull()
    .unique()
    .references(() => offices.id, { onDelete: "cascade" }),
  invgateLocationId: integer("invgate_location_id").notNull(),
  invgateParentId: integer("invgate_parent_id"),
  invgateParentName: text("invgate_parent_name"),  // ADD this line
  invgateDisplayName: text("invgate_display_name"),
  invgateCp: text("invgate_cp"),
  invgateCc: text("invgate_cc"),
  invgateAddress: text("invgate_address"),
  invgateDuplicateCount: integer("invgate_duplicate_count").default(0),
  lastSyncedAt: text("last_synced_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Push schema**

Run: `npm run db:push`
Expected: no errors, `invgate_parent_name` column added to `office_invgate_links` table.

---

### Task 2: Store parent name during sync

**Files:**
- Modify: `src/lib/invgate/officeLinkSync.ts`

The `parentName` is already resolved on line 111 but not passed to the insert/update. Add it.

- [ ] **Step 1: Add `invgateParentName` to the UPDATE block**

Find line 125-129 (inside `.set({...})`). Add the new field:

```typescript
        .set({
          invgateLocationId: invgateLoc.id,
          invgateParentId: parentId,
          invgateParentName: parentName,  // ADD this line
          invgateDisplayName: invgateLoc.displayName,
          invgateCp: invgateLoc.cp,
          invgateCc: invgateLoc.cc,
          invgateAddress: invgateLoc.address,
          invgateDuplicateCount: dupCount,
          lastSyncedAt: syncedAt,
        })
```

- [ ] **Step 2: Add `invgateParentName` to the INSERT block**

Find lines 134-143 (inside `.values({...})`). Add the new field:

```typescript
      await db.insert(officeInvgateLinks).values({
        officeId: officeDbId,
        invgateLocationId: invgateLoc.id,
        invgateParentId: parentId,
        invgateParentName: parentName,  // ADD this line
        invgateDisplayName: invgateLoc.displayName,
        invgateCp: invgateLoc.cp,
        invgateCc: invgateLoc.cc,
        invgateAddress: invgateLoc.address,
        invgateDuplicateCount: dupCount,
        lastSyncedAt: syncedAt,
      });
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors from officeLinkSync.ts.

---

### Task 3: Add InvGate fields to `OfficeDirectoryItem` type

**Files:**
- Modify: `src/types/offices.ts`

- [ ] **Step 1: Add fields to the interface**

After the existing `invgateDisplayName` field, add the remaining InvGate fields:

```typescript
export interface OfficeDirectoryItem {
  // ... existing fields ...
  terminals: OfficeTerminal[];
  invgateLinked?: boolean;
  invgateDisplayName?: string | null;
  invgateCp?: string | null;            // ADD
  invgateCc?: string | null;            // ADD
  invgateAddress?: string | null;       // ADD
  invgateParentName?: string | null;    // ADD
  invgateDuplicateCount?: number;       // ADD
}
```

---

### Task 4: Map InvGate fields in `getOffices()`

**Files:**
- Modify: `src/lib/officeQueries.ts`

The existing mapping already has `invgateLinked` and `invgateDisplayName`. Add the new fields.

- [ ] **Step 1: Add field mappings**

Find the `invgateLinked` and `invgateDisplayName` lines (~line 241). After them, add:

```typescript
        invgateLinked: !!office.invgateLink,
        invgateDisplayName: office.invgateLink?.invgateDisplayName ?? null,
        invgateCp: office.invgateLink?.invgateCp ?? null,            // ADD
        invgateCc: office.invgateLink?.invgateCc ?? null,            // ADD
        invgateAddress: office.invgateLink?.invgateAddress ?? null,  // ADD
        invgateParentName: office.invgateLink?.invgateParentName ?? null, // ADD
        invgateDuplicateCount: office.invgateLink?.invgateDuplicateCount ?? 0, // ADD
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors. The pre-existing error on line 204 about `Set<string | undefined>` is unrelated.

---

### Task 5: Add "Datos InvGate" section in OfficeRow detail panel

**Files:**
- Modify: `src/components/offices/OfficeRow.astro`

Add a new section in the expandable detail panel, styled identically to the existing Contactos and Información sections. The section renders when `office.invgateLinked` is true.

- [ ] **Step 1: Add `hasInvgateDetail` variable in frontmatter**

After line 47 (`const hasAssetsSection = totalAssets > 0;`), add:

```astro
const hasInvgateDetail: boolean = office.invgateLinked === true;
```

Then update line 43 (`const hasInfoSection = hasContacts || hasInfo;`):

```astro
const hasInfoSection = hasContacts || hasInfo || hasInvgateDetail;
```

And update line 49 (`const hasDetails = hasInfoSection || hasAssetsSection;`):

```astro
const hasDetails = hasInfoSection || hasAssetsSection || hasInvgateDetail;
```

(This last change ensures the chevron expand button appears when there's only InvGate data and nothing else.)

- [ ] **Step 2: Add "Datos InvGate" section HTML in the detail panel**

In the template, find the `{hasInfo && (` block (around line 298). After the closing `)}` of the info section and before the `</div>` that closes the `hasInfoSection` container, add:

```astro
                {hasInvgateDetail && (
                  <section class="space-y-3">
                    <h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-base-content/70">
                      <Icon
                        name="boxicons:data"
                        size={16}
                        class="text-secondary"
                        aria-hidden="true"
                      />
                      Datos InvGate
                    </h2>
                    <div class="rounded-lg border border-base-300 bg-base-100/50 p-3 shadow-sm">
                      {office.invgateCp && (
                        <p class="flex items-center gap-3 text-sm">
                          <span class="inline-block w-[100px] shrink-0 text-xs font-semibold text-base-content/60">CP</span>
                          <span class="font-mono text-sm text-base-content/90">{office.invgateCp}</span>
                        </p>
                      )}
                      {office.invgateCc && (
                        <p class="flex items-center gap-3 text-sm">
                          <span class="inline-block w-[100px] shrink-0 text-xs font-semibold text-base-content/60">CC</span>
                          <span class="font-mono text-sm text-base-content/90">{office.invgateCc}</span>
                        </p>
                      )}
                      {office.invgateAddress && (
                        <p class="flex items-center gap-3 text-sm">
                          <span class="inline-block w-[100px] shrink-0 text-xs font-semibold text-base-content/60">Dirección</span>
                          <span class="text-sm text-base-content/90">{office.invgateAddress}</span>
                        </p>
                      )}
                      {office.invgateDisplayName && (
                        <p class="flex items-center gap-3 text-sm">
                          <span class="inline-block w-[100px] shrink-0 text-xs font-semibold text-base-content/60">Nombre</span>
                          <span class="text-sm text-base-content/90">{office.invgateDisplayName}</span>
                        </p>
                      )}
                      {office.invgateParentName && (
                        <p class="flex items-center gap-3 text-sm">
                          <span class="inline-block w-[100px] shrink-0 text-xs font-semibold text-base-content/60">Parent InvGate</span>
                          <span class="text-sm text-base-content/90">{office.invgateParentName}</span>
                        </p>
                      )}
                      {office.invgateDuplicateCount && office.invgateDuplicateCount > 0 && (
                        <p class="mt-2 flex items-start gap-2 text-xs text-warning">
                          <Icon name="boxicons:info-circle" size={14} class="shrink-0 mt-0.5" />
                          <span>En InvGate se encontraron {office.invgateDuplicateCount} registros con el mismo NIS. Se vinculó el primero.</span>
                        </p>
                      )}
                      {!office.invgateCp && !office.invgateCc && !office.invgateAddress && !office.invgateDisplayName && !office.invgateParentName && (
                        <p class="text-xs text-base-content/50 italic">Sin datos adicionales de InvGate</p>
                      )}
                    </div>
                  </section>
                )}
```

The insertion point is inside the `{hasInfoSection && (` block, inside its `<div class:list={["space-y-5", ...]}>` container, after the `{hasInfo && (` block closes.

- [ ] **Step 3: Verify page renders**

Run: `npm run dev`
Navigate to `http://localhost:4321/oficinas`
Expected: page loads without errors. For offices with InvGate links, expanding the detail shows "Datos InvGate" section with CP, CC, Dirección, Nombre, Parent InvGate fields. If duplicates were detected, a warning message appears at the bottom.

- [ ] **Step 4: Run a sync to populate test data**

If InvGate credentials are configured, click "Sincronizar ahora" as admin.
Expected: after sync, linked offices show the "Datos InvGate" section in their expandable detail.

---

### Task 6: Self-review checklist

- [ ] Spec section 3.3 (Detalle expandible — sección "Datos InvGate") → Task 5 steps 1-2 (section HTML + variables)
- [ ] Spec section 3.3 (same h2 typography as Contactos/Información) → Task 5 step 2 (uses same classes: `text-xs font-bold uppercase tracking-wide text-base-content/70`)
- [ ] Spec section 3.3 (same card style) → Task 5 step 2 (`rounded-lg border border-base-300 bg-base-100/50 p-3 shadow-sm`)
- [ ] Spec section 3.3 (field order: CP, CC, Dirección, Nombre, Parent InvGate) → Task 5 step 2 (fields in that exact order)
- [ ] Spec section 3.3 (NIS duplicate warning) → Task 5 step 2 (duplicate message at bottom)
- [ ] Spec section 3.5 (CP, CC, Dirección, Nombre as labeled pairs) → Task 5 step 2 (each as `flex items-center gap-3` row)
- [ ] Spec section 3.5 (parent name resolved from parent_id) → Task 1+2 (schema column + sync storage)
- [ ] Spec Fase 1 item 6 → All tasks 1-5
