# Vinculación Oficinas ↔ InvGate — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable InvGate location matching for the offices directory: persist links in DB, show badge per office (3 states), show global freshness indicator with admin-only manual sync button.

**Architecture:** New table `office_invgate_links` stores one link per office. A sync function fetches InvGate locations, matches against offices via existing `matchLocations()`, and upserts into the link table. A PM2 worker calls the sync endpoint daily. `OfficeRow` reads the link table via LEFT JOIN to render the badge. `DirectorioContent` reads `MAX(last_synced_at)` for the global indicator.

**Tech Stack:** Astro SSR, Drizzle ORM + better-sqlite3, InvGate REST API, PM2 cron, DaisyUI badges

**Spec:** `docs/superpowers/specs/2026-07-07-integracion-oficinas-invgate-design.md`

---

## File map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/db/schema.ts` | Add `office_invgate_links` table + relations |
| Create | `src/lib/invgate/officeLinkSync.ts` | Core sync logic: fetch InvGate → match → upsert |
| Modify | `src/lib/invgate/locationMatcher.ts` | Add `findDuplicateNis()` helper |
| Create | `src/pages/api/admin/invgate/locations/sync.ts` | API endpoint GET + POST, admin-gated |
| Create | `scripts/sync-office-links.ts` | PM2 worker that calls the sync endpoint daily |
| Modify | `ecosystem.config.cjs` | Register new PM2 worker |
| Modify | `src/lib/officeQueries.ts` | LEFT JOIN on `office_invgate_links` in `getOffices()` |
| Modify | `src/components/offices/OfficeRow.astro` | Render 3-state badge (green/warning/ghost) |
| Modify | `src/components/offices/DirectorioContent.astro` | Global freshness indicator + admin sync button |
| Modify | `.env.example` | Add `SYNC_INTERNAL_KEY` variable |

---

### Task 1: Add `office_invgate_links` table to Drizzle schema

**Files:**
- Modify: `src/db/schema.ts`

Add the table definition after the existing `offices` relations section. The table stores one row per matched office with InvGate-derived data.

- [ ] **Step 1: Add table definition**

In `src/db/schema.ts`, after the `officesRelations` block (after line ~174) and before the `contactCategories` table (or at the end of the tables section), add:

```typescript
export const officeInvgateLinks = sqliteTable("office_invgate_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  officeId: integer("office_id")
    .notNull()
    .unique()
    .references(() => offices.id, { onDelete: "cascade" }),
  invgateLocationId: integer("invgate_location_id").notNull(),
  invgateParentId: integer("invgate_parent_id"),
  invgateDisplayName: text("invgate_display_name"),
  invgateCp: text("invgate_cp"),
  invgateCc: text("invgate_cc"),
  invgateAddress: text("invgate_address"),
  invgateDuplicateCount: integer("invgate_duplicate_count").default(0),
  lastSyncedAt: text("last_synced_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add relations to `officesRelations`**

In the `officesRelations` definition, add the many-to-one relation from `offices` to `officeInvgateLinks`:

Modify `officesRelations` (currently starts at ~line 166) to include the new relation:

```typescript
export const officesRelations = relations(offices, ({ one, many }) => ({
  province: one(provinces, {
    fields: [offices.provinceCode],
    references: [provinces.code],
  }),
  contacts: many(officeContacts),
  assets: many(officeAssets),
  terminals: many(terminals),
  invgateLink: one(officeInvgateLinks, {
    fields: [offices.id],
    references: [officeInvgateLinks.officeId],
  }),
}));
```

- [ ] **Step 3: Push schema**

Run: `npm run db:push`
Expected output: no errors, table created in `database/mda.db`.

- [ ] **Step 4: Verify table exists**

Run: `npx tsx -e "import { db } from './src/db/index'; import { officeInvgateLinks } from './src/db/schema'; db.select().from(officeInvgateLinks).all().then(r => console.log('Rows:', r.length))"`

Expected output: `Rows: 0`

---

### Task 2: Create core sync logic `syncOfficeInvgateLinks()`

**Files:**
- Create: `src/lib/invgate/officeLinkSync.ts`
- Modify: `src/lib/invgate/locationMatcher.ts`

Create the core sync function that: fetches InvGate locations, matches against offices, detects duplicate NIS, upserts into `office_invgate_links`.

- [ ] **Step 1: Add `findDuplicateNis()` to locationMatcher**

Add this exported function at the end of `src/lib/invgate/locationMatcher.ts`:

```typescript
/**
 * Scans InvGate locations for duplicate NIS values.
 * Returns a Map of nis → count (only includes nis with count > 1).
 */
export function findDuplicateNis(
  invgateLocations: InvgateLocation[]
): Map<string, number> {
  const nisCount = new Map<string, number>();
  for (const loc of invgateLocations) {
    const parsed = parseInvgateLocationName(loc.name);
    if (parsed.nis) {
      nisCount.set(parsed.nis, (nisCount.get(parsed.nis) || 0) + 1);
    }
  }
  const duplicates = new Map<string, number>();
  for (const [nis, count] of nisCount) {
    if (count > 1) {
      duplicates.set(nis, count);
    }
  }
  return duplicates;
}
```

This imports `parseInvgateLocationName` (already in the same file) and `InvgateLocation` from `@/types/invgate`.

- [ ] **Step 2: Create `src/lib/invgate/officeLinkSync.ts`**

Create the file with complete sync logic:

```typescript
import { db } from "../../db/index";
import { offices, officeInvgateLinks } from "../../db/schema";
import { invgateGet } from "../invgateClient";
import { matchLocations, parseInvgateLocationName, findDuplicateNis } from "./locationMatcher";
import type { InvgateLocation } from "../../types/invgate";
import { eq } from "drizzle-orm";

export interface SyncOfficeLinksResult {
  ok: boolean;
  totalInvgateLocations: number;
  totalMdaOffices: number;
  matched: number;
  unmatchedInvgate: number;
  duplicatesFound: number;
  error?: string;
}

async function resolveParentName(
  locations: InvgateLocation[],
  parentId: number | null,
): Promise<string | null> {
  if (parentId === null) return null;
  const parent = locations.find((l) => l.id === parentId);
  return parent ? parseInvgateLocationName(parent.name).displayName : null;
}

export async function syncOfficeInvgateLinks(): Promise<SyncOfficeLinksResult> {
  console.log("[SyncOfficeLinks] Iniciando sincronización de vínculos oficinas ↔ InvGate...");

  // 1. Fetch all InvGate locations
  const locationsResult = await invgateGet<any[]>("locations");
  if (!locationsResult.ok || !("data" in locationsResult)) {
    const errorMsg = "message" in locationsResult ? (locationsResult as any).message : "Sin datos";
    return {
      ok: false,
      totalInvgateLocations: 0,
      totalMdaOffices: 0,
      matched: 0,
      unmatchedInvgate: 0,
      duplicatesFound: 0,
      error: errorMsg,
    };
  }

  const locations: InvgateLocation[] = Array.isArray(locationsResult.data)
    ? locationsResult.data
    : (locationsResult.data as any).data;

  if (!Array.isArray(locations)) {
    return {
      ok: false,
      totalInvgateLocations: 0,
      totalMdaOffices: 0,
      matched: 0,
      unmatchedInvgate: 0,
      duplicatesFound: 0,
      error: "Formato inesperado de locations",
    };
  }

  console.log(`[SyncOfficeLinks] ${locations.length} ubicaciones obtenidas de InvGate.`);

  // 2. Detect duplicate NIS
  const duplicateNis = findDuplicateNis(locations);
  const nisSeen = new Set<string>();

  // 3. Filter out duplicate locations (keep only first per NIS)
  const dedupedLocations = locations.filter((loc) => {
    const parsed = parseInvgateLocationName(loc.name);
    if (!parsed.nis) return true; // can't be duplicate if no NIS
    if (nisSeen.has(parsed.nis)) return false;
    nisSeen.add(parsed.nis);
    return true;
  });

  // 4. Load all office codes into a Map
  const allOfficesRows = await db
    .select({ id: offices.id, code: offices.code, name: offices.name, address: offices.address })
    .from(offices);
  const officeCodeMap = new Map<string, { name: string; address: string }>();
  const officeToId = new Map<string, number>();
  for (const o of allOfficesRows) {
    if (o.code) {
      officeCodeMap.set(o.code, { name: o.name, address: o.address ?? "" });
      officeToId.set(o.code, o.id);
    }
  }

  // 5. Run existing matcher
  const { results, stats } = matchLocations(dedupedLocations, officeCodeMap);

  // 6. Upsert into office_invgate_links
  const syncedAt = new Date().toISOString();
  let upsertedCount = 0;
  let duplicatesWritten = 0;

  // Index raw locations by id for parent_id lookup (ParsedInvgateLocation drops parent_id)
  const rawLocById = new Map(dedupedLocations.map((l) => [l.id, l]));

  for (const match of results) {
    if (!match.matched) continue;

    const officeDbId = officeToId.get(match.officeCode!);
    if (!officeDbId) continue;

    const invgateLoc = match.invgateLocation;
    const rawLoc = rawLocById.get(invgateLoc.id);
    const parentId = rawLoc?.parent_id ?? null;
    const dupCount = invgateLoc.nis ? (duplicateNis.get(invgateLoc.nis) || 0) : 0;
    if (dupCount > 0) duplicatesWritten++;

    const parentName = await resolveParentName(dedupedLocations, parentId);

    const existing = await db
      .select({ id: officeInvgateLinks.id })
      .from(officeInvgateLinks)
      .where(eq(officeInvgateLinks.officeId, officeDbId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(officeInvgateLinks)
        .set({
          invgateLocationId: invgateLoc.id,
          invgateParentId: parentId,
          invgateDisplayName: invgateLoc.displayName,
          invgateCp: invgateLoc.cp,
          invgateCc: invgateLoc.cc,
          invgateAddress: invgateLoc.address,
          invgateDuplicateCount: dupCount,
          lastSyncedAt: syncedAt,
        })
        .where(eq(officeInvgateLinks.id, existing[0].id));
    } else {
      await db.insert(officeInvgateLinks).values({
        officeId: officeDbId,
        invgateLocationId: invgateLoc.id,
        invgateParentId: parentId,
        invgateDisplayName: invgateLoc.displayName,
        invgateCp: invgateLoc.cp,
        invgateCc: invgateLoc.cc,
        invgateAddress: invgateLoc.address,
        invgateDuplicateCount: dupCount,
        lastSyncedAt: syncedAt,
      });
    }
    upsertedCount++;
  }

  console.log(
    `[SyncOfficeLinks] Sincronización finalizada. Matched: ${stats.matched}, ` +
    `Upserted: ${upsertedCount}, Duplicados: ${duplicatesWritten}`
  );

  return {
    ok: true,
    totalInvgateLocations: stats.totalInvgate,
    totalMdaOffices: stats.totalMda,
    matched: stats.matched,
    unmatchedInvgate: stats.unmatchedInvgate,
    duplicatesFound: duplicatesWritten,
  };
}
```

- [ ] **Step 3: Verify both files compile**

Run: `npx tsc --noEmit`
Expected: no new errors from `officeLinkSync.ts` or `locationMatcher.ts`.

---

### Task 3: Create sync API endpoint

**Files:**
- Create: `src/pages/api/admin/invgate/locations/sync.ts`

Create the API endpoint that handles both GET (cron) and POST (manual button). Admin-gated.

- [ ] **Step 1: Create the endpoint file**

Create `src/pages/api/admin/invgate/locations/sync.ts`:

```typescript
import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/apiResponse";
import { syncOfficeInvgateLinks } from "@/lib/invgate/officeLinkSync";

function getEnv(key: string): string {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return (import.meta.env as any)[key] || "";
  }
  return process.env[key] || "";
}

function isAdmin(locals: App.Locals): boolean {
  return locals.user?.role === "admin";
}

function hasInternalKey(request: Request): boolean {
  const internalKey = getEnv("SYNC_INTERNAL_KEY");
  if (!internalKey) return false;
  const headerKey = request.headers.get("X-Internal-Key");
  return headerKey === internalKey;
}

export const GET: APIRoute = async ({ request, locals }) => {
  // Allow cron worker with internal key OR admin session
  if (!isAdmin(locals) && !hasInternalKey(request)) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-sync] Iniciando sincronización (GET)...");
  const result = await syncOfficeInvgateLinks();

  return jsonResponse(result, result.ok ? 200 : 500);
};

export const POST: APIRoute = async ({ request, locals }) => {
  // POST is for manual button — admin session only, no internal key
  if (!isAdmin(locals)) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  console.log("[invgate-sync] Iniciando sincronización manual (POST)...");
  const result = await syncOfficeInvgateLinks();

  if (result.ok) {
    // Redirect back to the directory with a success toast
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${import.meta.env.BASE_URL || "/"}oficinas?toast_msg=Sincronizaci%C3%B3n+completada+${result.matched}+oficinas+vinculadas&toast_type=success`,
      },
    });
  }

  return jsonResponse(result, 500);
};
```

- [ ] **Step 2: Verify endpoint compiles**

Run: `npx tsc --noEmit`
Expected: no errors from the new endpoint.

---

### Task 4: Create PM2 worker script and register in ecosystem

**Files:**
- Create: `scripts/sync-office-links.ts`
- Modify: `ecosystem.config.cjs`
- Modify: `.env` (add `SYNC_INTERNAL_KEY`)

- [ ] **Step 1: Create worker script**

Create `scripts/sync-office-links.ts`:

```typescript
import "dotenv/config";

function getEnv(key: string): string {
  return process.env[key] || "";
}

async function main(): Promise<void> {
  const baseUrl = getEnv("INVGATE_BASE_URL");
  const internalKey = getEnv("SYNC_INTERNAL_KEY");
  const appBaseUrl = "http://localhost:4321"; // worker calls local server

  if (!internalKey) {
    console.error("[sync-office-links] SYNC_INTERNAL_KEY no configurada.");
    process.exit(1);
  }

  console.log(`[sync-office-links] Iniciando sincronización programada: ${new Date().toISOString()}`);

  try {
    const response = await fetch(
      `${appBaseUrl}/mda/api/admin/invgate/locations/sync`,
      {
        method: "GET",
        headers: {
          "X-Internal-Key": internalKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error(`[sync-office-links] Error HTTP ${response.status}: ${body}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log(
      `[sync-office-links] Sincronización completada. ` +
      `Matched: ${result.matched}, Duplicados: ${result.duplicatesFound}`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[sync-office-links] Error de red: ${msg}`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Register worker in ecosystem.config.cjs**

Add a new entry in `ecosystem.config.cjs` inside the `apps` array, after the last existing entry (after `sync-users` entry at ~line 37):

```javascript
    {
      name: "sync-office-links",
      script: "node",
      args: "--import tsx scripts/sync-office-links.ts",
      cron_restart: "0 3 * * *",
      autorestart: false,
      watch: false,
      error_file: "./logs/sync-office-links-error.log",
      out_file: "./logs/sync-office-links-out.log",
    },
```

- [ ] **Step 3: Add `SYNC_INTERNAL_KEY` to .env**

Add to `.env`:

```
SYNC_INTERNAL_KEY=changeme_generate_random_32_char_string
```

Also add to `.env.example`:

```
SYNC_INTERNAL_KEY=your_internal_key_here
```

---

### Task 5: Modify `getOffices()` to include InvGate link data

**Files:**
- Modify: `src/lib/officeQueries.ts`

Add a LEFT JOIN to `office_invgate_links` so the office data includes the link status.

- [ ] **Step 1: Update imports**

In `src/lib/officeQueries.ts`, update the import line:

```typescript
import { provinces, regions, offices, officeAssets, officeInvgateLinks } from "@db/schema";
```

Previously only imported `offices, officeAssets`. Add `officeInvgateLinks`.

- [ ] **Step 2: Add LEFT JOIN in the Drizzle query**

In the `dbOffices` query (around line 177), add the link table to the `with` clause. The existing query is:

```typescript
const dbOffices = await db.query.offices.findMany({
    where: whereClause,
    limit: limit,
    offset: offset,
    orderBy: (officesTable, { asc: ascFn, desc: descFn }) => { ... },
    with: {
      assets: true,
      terminals: true,
      contacts: { with: { contact: true } },
      province: { with: { region: true } },
    },
  });
```

Add `invgateLink: true` to the `with` object:

```typescript
const dbOffices = await db.query.offices.findMany({
    where: whereClause,
    limit: limit,
    offset: offset,
    orderBy: (officesTable, { asc: ascFn, desc: descFn }) => { ... },
    with: {
      assets: true,
      terminals: true,
      contacts: { with: { contact: true } },
      province: { with: { region: true } },
      invgateLink: true,
    },
  });
```

- [ ] **Step 3: Include link data in mapped output**

In the `officeDirectoryItems` mapping (around line 210), add two new fields to the returned object. Inside the `return { ... }` block, after the existing `terminals` field (after line ~270), add:

```typescript
        invgateLinked: !!office.invgateLink,
        invgateDisplayName: office.invgateLink?.invgateDisplayName ?? null,
```

- [ ] **Step 4: Update `OfficeDirectoryItem` type**

In `src/types/offices.ts`, add two new optional fields to the `OfficeDirectoryItem` interface:

```typescript
export interface OfficeDirectoryItem {
  // ... existing fields ...
  terminals: OfficeTerminal[];
  invgateLinked?: boolean;           // ADD
  invgateDisplayName?: string | null; // ADD
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no errors related to the new fields.

---

### Task 6: Render 3-state badge in OfficeRow

**Files:**
- Modify: `src/components/offices/OfficeRow.astro`

- [ ] **Step 1: Add badge markup in OfficeRow template**

In `src/components/offices/OfficeRow.astro`, add the InvGate badge after the NIS copy button (after the `</CopyButton>` on the code column, around line 121).

Find the line `</div>` that closes the code column div (after the CopyButton). After that `</div>` but before the next column div (the name column), add:

```astro
    <!-- InvGate badge: after NIS column, before name column -->
    {
      office.invgateLinked ? (
        <div class="flex items-center">
          <span
            class:list={[
              "badge badge-sm gap-1",
              office.invgateDisplayName && office.invgateDisplayName !== office.name
                ? "badge-warning"
                : "badge-success",
            ]}
            title={office.invgateDisplayName && office.invgateDisplayName !== office.name
              ? "Nombre difiere de InvGate. Ver detalle expandible."
              : "Presente en InvGate"}
          >
            <Icon name="boxicons:link" size={14} />
            En InvGate
          </span>
        </div>
      ) : (
        <div class="flex items-center">
          <span
            class="badge badge-ghost badge-sm gap-1"
            title="No registrada en InvGate"
          >
            <Icon name="boxicons:link" size={14} />
            Sin InvGate
          </span>
        </div>
      )
    }
```

- [ ] **Step 2: Adjust grid layout for the new badge column**

The `officeDirectoryRowGridClass` (line ~54) currently has:
- With admin: `grid-cols-[48px_80px_1.2fr_90px_1.8fr_110px_120px]`
- Without admin: `grid-cols-[48px_80px_1.2fr_90px_1.8fr_110px]`

Add a column for the badge. Insert `auto` after the code column (second track, `80px`):

```astro
const officeDirectoryRowGridClass = isAllowedAdmin
  ? "grid grid-cols-[48px_80px_auto_1.2fr_90px_1.8fr_110px_120px] items-center gap-4"
  : "grid grid-cols-[48px_80px_auto_1.2fr_90px_1.8fr_110px] items-center gap-4";
```

- [ ] **Step 3: Also add badge column in the header grid**

In `DirectorioContent.astro`, the `officeDirectoryHeaderGridClass` (line ~185) mirrors the same grid. Update it to match:

```astro
const officeDirectoryHeaderGridClass = isAllowedAdmin
  ? "grid-cols-[48px_80px_auto_1.2fr_90px_1.8fr_110px_120px] gap-4"
  : "grid-cols-[48px_80px_auto_1.2fr_90px_1.8fr_110px] gap-4";
```

And add a new header cell between the "Código" header and "Nombre" header columns in the table header slots:

```astro
<div slot="header">
  <DataTableHeaderCell>
    <span class="sr-only">InvGate</span>
  </DataTableHeaderCell>
</div>
```

Place this slot after the "Código" header slot (`<div slot="header"><DataTableHeaderCell sortKey="code"> Código </...</div>`) and before the "Nombre" header slot.

- [ ] **Step 4: Verify the page renders**

Run: `npm run dev`
Navigate to `http://localhost:4321/oficinas`
Expected: no crash. Badges show as ghost "Sin InvGate" since no sync has been run yet.

---

### Task 7: Add global freshness indicator + admin sync button

**Files:**
- Modify: `src/components/offices/DirectorioContent.astro`

- [ ] **Step 1: Query last sync timestamp**

In the frontmatter of `DirectorioContent.astro`, after the existing imports and before the `const typeFilter` line (around line 33-34), add a query for the most recent sync timestamp:

```typescript
import { db } from "@db/index";
import { officeInvgateLinks } from "@db/schema";
import { sql } from "drizzle-orm";

const [lastSyncRow] = await db
  .select({ lastSync: officeInvgateLinks.lastSyncedAt })
  .from(officeInvgateLinks)
  .orderBy(sql`${officeInvgateLinks.lastSyncedAt} DESC`)
  .limit(1);

const lastSyncDate = lastSyncRow?.lastSync ?? null;

const syncAgeDays = lastSyncDate
  ? Math.floor((Date.now() - new Date(lastSyncDate + "Z").getTime()) / (1000 * 60 * 60 * 24))
  : null;

const syncAlertClass = !lastSyncDate
  ? "alert-info"
  : syncAgeDays !== null && syncAgeDays > 7
    ? "alert-warning"
    : "alert-info";

const syncAlertIcon = !lastSyncDate
  ? "boxicons:clock"
  : syncAgeDays !== null && syncAgeDays > 7
    ? "boxicons:clock"
    : "boxicons:refresh";

const syncMessage = !lastSyncDate
  ? "InvGate: sin datos de sincronización"
  : syncAgeDays !== null && syncAgeDays > 7
    ? `InvGate sin sincronizar desde hace ${syncAgeDays} días. Los datos pueden estar desactualizados.`
    : `InvGate sincronizado: hace ${syncAgeDays === 0 ? "menos de 1" : syncAgeDays} día${syncAgeDays !== 1 ? "s" : ""}`;
```

- [ ] **Step 2: Add alert strip above the filter form**

In the template, after the `ViewSwitcher` block and before the `<form method="GET" ...>` that starts the filter section (around line 210), add:

```astro
  <!-- InvGate sync freshness indicator -->
  <div class={`alert ${syncAlertClass} shadow-sm mt-6`}>
    <Icon name={syncAlertIcon} size={20} />
    <span class="text-sm">{syncMessage}</span>
    {
      isAllowedAdmin && (
        <form method="POST" action={import.meta.env.BASE_URL + "api/admin/invgate/locations/sync"} class="ml-auto">
          <button type="submit" class="btn btn-sm btn-outline">
            <Icon name="boxicons:refresh" size={16} />
            Sincronizar ahora
          </button>
        </form>
      )
    }
  </div>
```

- [ ] **Step 3: Verify the page renders with the indicator**

Run: `npm run dev`
Navigate to `http://localhost:4321/oficinas`
Expected: alert strip visible. Text says "InvGate: sin datos de sincronización" (no sync has been run yet). Admin users see the "Sincronizar ahora" button.

---

### Task 8: End-to-end manual verification

**Files:** none (manual testing)

- [ ] **Step 1: Run first sync**

Ensure `.env` has valid InvGate credentials.
As admin user, click "Sincronizar ahora" on the directory page.

Expected: browser redirects back to `/oficinas` with success toast showing matched count.

- [ ] **Step 2: Verify badges appear**

After sync completes, check the directory page.
Expected: offices matched with InvGate show green or warning "En InvGate" badge. Unmatched show ghost "Sin InvGate" badge.

- [ ] **Step 3: Verify global indicator updates**

Check the alert strip after sync.
Expected: "InvGate sincronizado: hace 0 días" (or similar).

- [ ] **Step 4: Verify non-admin cannot sync**

Log in as a non-admin user.
Expected: "Sincronizar ahora" button is not visible.

- [ ] **Step 5: Test cron worker manually**

Run: `npx tsx scripts/sync-office-links.ts`
Expected: worker logs success message with matched count, exits 0.

- [ ] **Step 6: Verify data in DB**

Run: `npm run db:studio`
Open `office_invgate_links` table.
Expected: rows with office_id, invgate_location_id, cp, cc, address fields populated.

- [ ] **Step 7: Verify endpoint rejects unauthorized GET**

From a terminal, test calling the sync endpoint without auth:
Run: `curl -s http://localhost:4321/mda/api/admin/invgate/locations/sync | head -1`
Expected: `{"error":"No autorizado"}`

---

### Task 9: Self-review checklist

- [ ] Spec section 3.2 (table schema) → Task 1
- [ ] Spec section 3.1 (matching, reuse locationMatcher) → Task 2 step 2
- [ ] Spec section 3.2 (duplicate NIS handling) → Task 2 step 1
- [ ] Spec section 3.3 (3-state badge) → Task 6
- [ ] Spec section 3.3a (global freshness indicator) → Task 7
- [ ] Spec section 3.3a (admin sync button) → Task 7 step 2
- [ ] Spec section 3.6 (cron trigger) → Task 4
- [ ] Spec section 3.6 (manual trigger) → Task 7 step 2
- [ ] Spec section 3.7 (RBAC: badge visible to all) → Task 6 (no role check on badge)
- [ ] Spec section 3.7 (RBAC: sync button admin-only) → Task 7 step 2 (wrapped in `isAllowedAdmin`)
- [ ] Spec section 3.7 (RBAC: endpoint admin-gated GET+POST) → Task 3
- [ ] Spec section 6.1 (NIS duplicates: take first, warn later) → Task 2 (dedup, write count)
- [ ] Spec section 6.5 (X-Internal-Key for cron) → Task 4 step 1
- [ ] Spec Fase 1 items 1-5 → Tasks 1-7

No gaps. All Fase 1 items covered.
