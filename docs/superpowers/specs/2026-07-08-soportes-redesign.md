# Soportes Redesign — Spec

**Date:** 2026-07-08
**Status:** Approved
**Scope:** Remodelar vista `/soportes` usando datos de InvGate API como fuente de verdad para helpdesks, manteniendo registros locales de metadata histórica de Service Manager.

---

## 1. Goals

- Reemplazar DataTable actual por card grid con diseño daisyUI (`card` + `stat` + `badge`)
- `/soportes` como ruta única: pública read-only para todos, botones editar solo para admin
- Eliminar create y delete (helpdesks vienen de InvGate, registros locales no se borran)
- Migrar registros antiguos de `support_guides` asignándoles `invgate_id` mediante dropdown en edit
- Cada card agrupa registros locales por helpdesk InvGate

---

## 2. Data Flow

```
GET /helpdesks (InvGate API)           SELECT * FROM support_guides (SQLite)
        │                                          │
        └──────────── Merge por invgate_id ────────┘
                           │
                    SoportesContent.astro (server:defer)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     HelpdeskCard    HelpdeskCard   UnassignedRecords
     (con registros) (sin registros) (solo admin)
```

## 3. Database Changes

### `support_guides` table (src/db/schema.ts)

Add two columns:

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `invgate_id` | `integer` | none (NOT unique) | Links to InvGate helpdesk ID. Multiple local records can point to same InvGate helpdesk. |
| `categories` | `text` | none | JSON array of InvGate category IDs assigned to this helpdesk. Example: `"[5,12,23]"` |

Existing columns `helpDeskName`, `invgateName` retained as fallback but UI derives InvGate names from API.

### Migration

Existing rows have `invgate_id = NULL`. Admin assigns each one via edit form dropdown.

## 4. Component Architecture

### `SoportesContent.astro` (rewrite of current SoportesPublicContent.astro)

Server-side logic:
1. `await invgateGet<InvgateHelpdesk[]>("helpdesks")` — fetch all helpdesks from InvGate
2. `await db.query.supportGuides.findMany()` — fetch all local records
3. Merge: group local records by `invgate_id`
4. If InvGate API fails, show all helpdesks from local DB as fallback (by helpDeskName)

Props to template:
- `invgateHelpdesks: InvgateHelpdesk[]`
- `groupedRecords: Map<number, SupportGuide[]>` (keyed by invgate_id)
- `unassignedRecords: SupportGuide[]` (invgate_id = NULL)
- `isAdmin: boolean`

### `HelpdeskCard.astro` (new)

Receives: `helpdesk: InvgateHelpdesk`, `records: SupportGuide[]`, `isAdmin: boolean`

Layout:
```
┌──────────────────────────────────────┐
│ [status badge]  <helpdesk.name>      │
│ 👥 <total_members> miembros          │
│ 📂 Padre: <parent helpdesk name>    │  (if parent_id)
│──────────────────────────────────────│
│ Registros locales:                   │
│ ┌────────────────────────────────┐   │
│ │ SM: <legacyName>               │   │
│ │ Categorías: [cat1] [cat2]      │   │
│ │ Tópicos: [topic1] [topic2]     │   │
│ │ Ruta: <route>                  │   │
│ │              [Editar registro] │   │  (admin only)
│ └────────────────────────────────┘   │
│ ... (más registros si hay)           │
│ (si no hay: "Sin info complementaria")│
│──────────────────────────────────────│
│ [Ver más (modal)]      [Editar]     │  (admin sees both, others only Ver más)
└──────────────────────────────────────┘
```

Note: when there are no records, "Editar" creates a new local record linked to this helpdesk. The edit form at `/soportes/edit/new?invgate_id=X` handles creation of local metadata for an existing InvGate helpdesk.

### `HelpdeskDetailModal.astro` (new)

Modal triggered by "Ver más". Shows for each local record:
- Contactos, Referentes, Notas
- Members count, parent helpdesk name (from InvGate)

### `UnassignedRecords.astro` (new)

Visible only to admin when `unassignedRecords.length > 0`. Rendered at top of page.

For each unassigned record: shows its current data + a dropdown with all InvGate helpdesks. On select, POST to `/api/support-guides/assign` to set `invgate_id`.

### `SoportesSkeleton.astro` (rewrite)

Placeholder cards (3-6 skeleton cards using daisyUI `skeleton`).

## 5. Routes

| Route | Method | Auth | Action |
|-------|--------|------|--------|
| `/soportes` | GET | any authenticated | Card grid (server:defer + skeleton) |
| `/soportes/edit/[id]` | GET/POST | admin, supervisor | Edit local metadata for a support_guide record |
| `/soportes/edit/new` | GET/POST | admin, supervisor | Create local metadata for an InvGate helpdesk that has none |
| `/api/support-guides/assign` | POST | admin, supervisor | Assign invgate_id to a local record |

### Removed routes

| Route | Reason |
|-------|--------|
| `/soportes/create` | Helpdesks come from InvGate, not created manually |
| `/soportes/edit/[id]/eliminar` | Local records are not deleted |

### RBAC changes

Remove from `routePermissions` in `src/lib/rbac.ts`:
- `{ path: "/soportes/create", roles: ["admin", "supervisor"] }`

Keep:
- `{ path: "/soportes/edit", roles: ["admin", "supervisor"] }`

## 6. Edit Form (`/soportes/edit/[id]`)

Fields:
- `legacyName` (text) — Nombre anterior en Service Manager
- `categories` (multi-select or tag input) — Categorías InvGate asignadas
- `topics` (textarea, JSON array format) — Tópicos a tratar
- `route` (text) — Ruta de derivación
- `contacts` (textarea) — Contactos
- `referents` (textarea) — Referentes
- `notes` (textarea) — Notas
- `invgate_id` (dropdown) — Helpdesk InvGate asignada (opciones de `GET /helpdesks`)

Non-editable display:
- Helpdesk name from InvGate (shown as read-only info)

For new records (`/soportes/edit/new?invgate_id=X`): same form but pre-filled `invgate_id` from query param.

## 7. API Endpoint: `/api/support-guides/assign`

POST `{ recordId: number, invgate_id: number }`

Assigns `invgate_id` to an existing `support_guides` record. Used by the dropdown in `UnassignedRecords`.

Returns: `{ ok: true }` or `{ error: string }` with appropriate status.

Audit log: `"${username} ha asignado la mesa de ayuda ${helpDeskName} al helpdesk de InvGate ID ${invgate_id}."`

## 8. Navigation

Add `/soportes` to `navSections` in `src/lib/navigation.ts` under "Accesos rápidos":

```ts
{
  href: "/soportes",
  label: "Soportes",
  icon: "boxicons:buoy-filled",
}
```

## 9. Cleanup

Remove orphaned files:
- `src/components/admin/soportes/AdminSoportesContent.astro`
- `src/components/admin/soportes/AdminSoportesSkeleton.astro`
- `src/components/support-guides/SupportGuideRow.astro` (replaced by HelpdeskCard)

Remove from `auditDictionary`:
- `soportes.create` and `soportes.delete` entries (keep `soportes.update`)

## 10. Error Handling

- If InvGate API is unreachable: display error banner at top, show fallback using only local DB data (helpDeskName as card header instead of InvGate name)
- If no local records exist at all and InvGate fails: show empty state
- If a single helpdesk fetch fails intermittently: skip it, show remaining cards
