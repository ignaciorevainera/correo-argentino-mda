# Soportes Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/soportes` view from DataTable to daisyUI card grid, sourcing helpdesk data from InvGate API with local metadata records grouped per helpdesk.

**Architecture:** Server-side merges `GET /helpdesks` (InvGate API) with `support_guides` (SQLite) by `invgate_id`. Cards rendered via `server:defer` + skeleton fallback. Single route `/soportes` with admin-only edit buttons. No create/delete — local records are assigned to InvGate helpdesks via dropdown.

**Tech Stack:** Astro v6 SSR, Tailwind v4, DaisyUI v5, Drizzle ORM, SQLite, InvGate REST API

**Spec:** `docs/superpowers/specs/2026-07-08-soportes-redesign.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/db/schema.ts` | Add `invgate_id`, `categories` columns |
| Create | `src/pages/api/support-guides/assign.ts` | POST endpoint for assigning invgate_id |
| Create | `src/components/soportes/HelpdeskDetailModal.astro` | Modal for contacts/referents/notes |
| Create | `src/components/soportes/HelpdeskCard.astro` | Single InvGate helpdesk card with grouped records |
| Create | `src/components/soportes/UnassignedRecords.astro` | Admin section for records without invgate_id |
| Rewrite | `src/components/soportes/SoportesPublicContent.astro` | Main content: fetch + merge + render cards |
| Rewrite | `src/components/soportes/SoportesPublicSkeleton.astro` | Card skeleton placeholders |
| Modify | `src/pages/soportes/index.astro` | Point to rewritten content component |
| Rewrite | `src/pages/soportes/edit/[id].astro` | Simplified edit: only local metadata + invgate dropdown |
| Create | `src/pages/soportes/edit/new.astro` | New local record form for existing InvGate helpdesk |
| Delete | `src/pages/soportes/create.astro` | No longer needed |
| Delete | `src/pages/soportes/edit/[id]/eliminar.ts` | No longer needed |
| Delete | `src/components/admin/soportes/AdminSoportesContent.astro` | Orphaned, replaced by SoportesContent |
| Delete | `src/components/admin/soportes/AdminSoportesSkeleton.astro` | Orphaned, replaced by SoportesSkeleton |
| Delete | `src/components/support-guides/SupportGuideRow.astro` | Replaced by HelpdeskCard |
| Modify | `src/lib/navigation.ts` | Add `/soportes` to navSections |
| Modify | `src/lib/rbac.ts` | Remove `/soportes/create` permission |
| Modify | `src/lib/auditDictionary.ts` | Remove `soportes.create` and `soportes.delete` |

---

### Task 1: Add `invgate_id` and `categories` to DB schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add columns to supportGuides table**

Open `src/db/schema.ts`. Find the `supportGuides` table definition (around line 621). Add two new columns after `id`:

```typescript
export const supportGuides = sqliteTable("support_guides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invgate_id: integer("invgate_id"),
  categories: text("categories"),
  helpDeskName: text("help_desk_name").notNull(),
  legacyName: text("legacy_name"),
  invgateName: text("invgate_name"),
  route: text("route"),
  topics: text("topics"),
  contacts: text("contacts"),
  referents: text("referents"),
  notes: text("notes"),
  searchableText: text("searchable_text"),
});
```

- [ ] **Step 2: Push schema to SQLite**

```bash
npm run db:push
```

Expected: "No changes to push" or success message. If migration mismatch, run `npx tsx scripts/fix-drizzle-mismatch.ts` then retry.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add invgate_id and categories columns to support_guides"
```

---

### Task 2: Create assign API endpoint

**Files:**
- Create: `src/pages/api/support-guides/assign.ts`

- [ ] **Step 1: Create the API route file**

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = requireWriteAccess(locals);
  if (!auth.ok) return jsonResponse({ error: auth.message }, 403);

  try {
    const body = await request.json();
    const recordId = Number(body.recordId);
    const invgateId = Number(body.invgate_id);

    if (!recordId || !invgateId || isNaN(recordId) || isNaN(invgateId)) {
      return jsonResponse({ error: "recordId e invgate_id son requeridos y deben ser numeros" }, 400);
    }

    const [record] = await db
      .select({ helpDeskName: supportGuides.helpDeskName })
      .from(supportGuides)
      .where(eq(supportGuides.id, recordId));

    if (!record) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    await db
      .update(supportGuides)
      .set({ invgate_id: invgateId })
      .where(eq(supportGuides.id, recordId));

    await logAdminAction(
      locals.user?.username || "sistema",
      `Asigno la mesa de ayuda "${record.helpDeskName}" al helpdesk de InvGate ID ${invgateId}.`,
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[assign] Error:", err);
    return jsonResponse({ error: "Error interno al asignar helpdesk" }, 500);
  }
};
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/pages/api/support-guides/assign.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/support-guides/assign.ts
git commit -m "feat: add assign API endpoint for support guides"
```

---

### Task 3: Create HelpdeskDetailModal component

**Files:**
- Create: `src/components/soportes/HelpdeskDetailModal.astro`

- [ ] **Step 1: Create the modal component**

```astro
---
import { Icon } from "astro-icon/components";
import Modal from "@components/ui/Modal.astro";
import type { InvgateHelpdesk } from "@/types/invgate";

interface Props {
  modalId: string;
  helpdesk: InvgateHelpdesk;
  records: any[];
  parentName?: string;
}

const { modalId, helpdesk, records, parentName } = Astro.props;
---

<Modal
  id={modalId}
  title={helpdesk.name}
  icon="boxicons:buoy-filled"
  titleClass="font-black"
  class="border-t-4 border-t-secondary"
>
  <Fragment slot="content">
    <div class="space-y-4 text-sm text-base-content/80">
      <div class="flex flex-wrap gap-3">
        <div class="badge badge-neutral gap-1">
          <Icon name="boxicons:group" size={14} />
          {helpdesk.total_members} miembros
        </div>
        <div class:list={[
          "badge gap-1",
          helpdesk.status_id === 1 ? "badge-success" : "badge-ghost",
        ]}>
          {helpdesk.status_id === 1 ? "Activo" : "Inactivo"}
        </div>
        {parentName && (
          <div class="badge badge-ghost gap-1">
            <Icon name="boxicons:git-branch" size={14} />
            Padre: {parentName}
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <p class="text-base-content/50 italic">Sin informacion complementaria registrada.</p>
      ) : (
        records.map((guide) => (
          <div class="space-y-3">
            {guide.legacyName && (
              <div class="bg-base-200/50 p-3 rounded-lg border border-base-300">
                <h4 class="font-bold flex items-center gap-1 mb-1 text-base-content/90">
                  <Icon name="boxicons:rename" size={16} class="text-secondary" />
                  Nombre Anterior (SM)
                </h4>
                <p>{guide.legacyName}</p>
              </div>
            )}

            <div class="bg-base-200/50 p-3 rounded-lg border border-base-300">
              <h4 class="font-bold flex items-center gap-1 mb-1 text-base-content/90">
                <Icon name="boxicons:phone" size={16} class="text-secondary" />
                Contactos
              </h4>
              <p class="whitespace-pre-wrap">
                {guide.contacts || <span class="italic text-base-content/50">Sin informacion de contactos</span>}
              </p>
            </div>

            <div class="bg-base-200/50 p-3 rounded-lg border border-base-300">
              <h4 class="font-bold flex items-center gap-1 mb-1 text-base-content/90">
                <Icon name="boxicons:user-filled" size={16} class="text-secondary" />
                Referentes
              </h4>
              <p class="whitespace-pre-wrap">
                {guide.referents || <span class="italic text-base-content/50">Sin referentes designados</span>}
              </p>
            </div>

            <div class="bg-base-200/50 p-3 rounded-lg border border-base-300">
              <h4 class="font-bold flex items-center gap-1 mb-1 text-base-content/90">
                <Icon name="boxicons:note" size={16} class="text-secondary" />
                Notas
              </h4>
              <p class="whitespace-pre-wrap">
                {guide.notes || <span class="italic text-base-content/50">Sin notas adicionales</span>}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  </Fragment>
</Modal>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/soportes/HelpdeskDetailModal.astro
git commit -m "feat: add HelpdeskDetailModal for soportes cards"
```

---

### Task 4: Create HelpdeskCard component

**Files:**
- Create: `src/components/soportes/HelpdeskCard.astro`

- [ ] **Step 1: Create the card component**

```astro
---
import { Icon } from "astro-icon/components";
import { getCleanBase } from "@lib/baseUrl";
import HelpdeskDetailModal from "./HelpdeskDetailModal.astro";
import type { InvgateHelpdesk } from "@/types/invgate";

interface Props {
  helpdesk: InvgateHelpdesk;
  records: any[];
  isAdmin: boolean;
  parentName?: string;
}

const { helpdesk, records, isAdmin, parentName } = Astro.props;
const cleanBase = getCleanBase();
const modalId = `modal_hd_${helpdesk.id}`;
const statusBadge = helpdesk.status_id === 1
  ? "badge-success"
  : "badge-ghost";
const statusLabel = helpdesk.status_id === 1 ? "Activo" : "Inactivo";
---

<div class="card bg-base-100 shadow-sm border border-base-300">
  <div class="card-body p-5 gap-3">
    <!-- Header: InvGate data -->
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <h3 class="card-title text-base flex items-center gap-2 truncate">
          <Icon name="boxicons:buoy-filled" size={20} class="text-secondary shrink-0" />
          <span class="truncate">{helpdesk.name}</span>
        </h3>
        <div class="flex flex-wrap items-center gap-2 mt-1">
          <span class="badge badge-sm gap-1 font-mono">
            <Icon name="boxicons:group" size={12} />
            {helpdesk.total_members}
          </span>
          <span class:list={["badge badge-sm", statusBadge]}>{statusLabel}</span>
          {parentName && (
            <span class="badge badge-sm badge-ghost" title={`Helpdesk padre: ${parentName}`}>
              <Icon name="boxicons:git-branch" size={12} class="mr-0.5" />
              {parentName}
            </span>
          )}
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-base-200"></div>

    <!-- Local records -->
    {records.length === 0 ? (
      <p class="text-sm text-base-content/50 italic py-2">Sin informacion complementaria</p>
    ) : (
      <div class="space-y-3">
        {records.map((guide) => {
          let topicsList: string[] = [];
          if (guide.topics) {
            try {
              const parsed = JSON.parse(guide.topics);
              topicsList = Array.isArray(parsed) ? parsed : [];
            } catch {
              topicsList = guide.topics.split(",").map((t: string) => t.trim()).filter(Boolean);
            }
          }

          let categoryIds: number[] = [];
          if (guide.categories) {
            try { categoryIds = JSON.parse(guide.categories); } catch {}
          }

          return (
            <div class="bg-base-200/40 rounded-lg p-3 border border-base-300">
              {guide.legacyName && (
                <p class="text-sm font-semibold text-base-content mb-1.5">
                  SM: {guide.legacyName}
                </p>
              )}

              {guide.route && (
                <p class="text-xs font-mono text-base-content/60 mb-1.5 truncate" title={guide.route}>
                  {guide.route}
                </p>
              )}

              {categoryIds.length > 0 && (
                <div class="flex flex-wrap gap-1 mb-1.5">
                  <span class="text-xs text-base-content/50">Categorias:</span>
                  {categoryIds.map((cid) => (
                    <span class="badge badge-xs badge-outline">ID:{cid}</span>
                  ))}
                </div>
              )}

              {topicsList.length > 0 && (
                <div class="flex flex-wrap gap-1">
                  {topicsList.map((t) => (
                    <span class="badge badge-sm badge-secondary badge-soft">{t}</span>
                  ))}
                </div>
              )}

              {isAdmin && (
                <div class="mt-2 pt-2 border-t border-base-200 flex justify-end">
                  <a
                    href={`${cleanBase}soportes/edit/${guide.id}`}
                    class="btn btn-xs btn-ghost text-secondary"
                  >
                    <Icon name="boxicons:edit" size={14} />
                    Editar registro
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}

    <!-- Card actions -->
    <div class="card-actions justify-end mt-1">
      <button
        class="btn btn-sm btn-ghost"
        onclick={`document.getElementById('${modalId}').showModal()`}
      >
        <Icon name="boxicons:info-circle" size={16} />
        Ver mas
      </button>
      {isAdmin && (
        <a
          href={`${cleanBase}soportes/edit/new?invgate_id=${helpdesk.id}`}
          class="btn btn-sm btn-secondary btn-soft"
        >
          <Icon name="boxicons:edit" size={16} />
          Agregar info
        </a>
      )}
    </div>
  </div>
</div>

<HelpdeskDetailModal
  modalId={modalId}
  helpdesk={helpdesk}
  records={records}
  parentName={parentName}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/soportes/HelpdeskCard.astro
git commit -m "feat: add HelpdeskCard component for soportes"
```

---

### Task 5: Create UnassignedRecords component

**Files:**
- Create: `src/components/soportes/UnassignedRecords.astro`

- [ ] **Step 1: Create the component**

```astro
---
import { Icon } from "astro-icon/components";
import { getCleanBase } from "@lib/baseUrl";
import type { InvgateHelpdesk } from "@/types/invgate";

interface Props {
  records: any[];
  helpdesks: InvgateHelpdesk[];
  isAdmin: boolean;
}

const { records, helpdesks, isAdmin } = Astro.props;

if (!isAdmin || records.length === 0) {
  return new Response(null, { status: 200 });
}

const cleanBase = getCleanBase();
---

<div class="mb-8 bg-warning/5 border border-warning/20 rounded-box p-5">
  <div class="flex items-center gap-2 mb-4">
    <Icon name="boxicons:error-circle" size={20} class="text-warning" />
    <h2 class="text-lg font-bold text-warning">
      Registros sin asignar ({records.length})
    </h2>
  </div>
  <p class="text-sm text-base-content/70 mb-4">
    Estos registros locales no estan vinculados a ninguna mesa de ayuda de InvGate.
    Asignalos para que aparezcan dentro de su card correspondiente.
  </p>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {records.map((guide) => {
      let topicsList: string[] = [];
      if (guide.topics) {
        try {
          const parsed = JSON.parse(guide.topics);
          topicsList = Array.isArray(parsed) ? parsed : [];
        } catch {
          topicsList = guide.topics.split(",").map((t: string) => t.trim()).filter(Boolean);
        }
      }
      const selectId = `assign-select-${guide.id}`;

      return (
        <div class="bg-base-100 rounded-lg p-4 border border-base-300 flex flex-col gap-2">
          <p class="font-semibold text-sm truncate">
            {guide.helpDeskName || `Registro #${guide.id}`}
          </p>
          {guide.legacyName && (
            <p class="text-xs text-base-content/60">SM: {guide.legacyName}</p>
          )}
          {topicsList.length > 0 && (
            <div class="flex flex-wrap gap-1">
              {topicsList.slice(0, 3).map((t) => (
                <span class="badge badge-xs badge-outline">{t}</span>
              ))}
              {topicsList.length > 3 && (
                <span class="text-xs text-base-content/50">+{topicsList.length - 3}</span>
              )}
            </div>
          )}
          <div class="flex items-center gap-2 mt-2">
            <select
              id={selectId}
              class="select select-sm select-bordered flex-1 text-xs"
            >
              <option value="">Seleccionar helpdesk...</option>
              {helpdesks.map((hd) => (
                <option value={hd.id}>{hd.name}</option>
              ))}
            </select>
            <a
              href={`${cleanBase}soportes/edit/${guide.id}`}
              class="btn btn-xs btn-ghost"
              title="Editar registro completo"
            >
              <Icon name="boxicons:edit" size={14} />
            </a>
            <button
              class="btn btn-xs btn-primary"
              data-assign-btn
              data-record-id={guide.id}
              data-select-id={selectId}
            >
              Asignar
            </button>
          </div>
        </div>
      );
    })}
  </div>
</div>

<script>
  const cleanBase = (() => {
    const b = import.meta.env.BASE_URL || "/";
    return b.endsWith("/") ? b : b + "/";
  })();

  document.querySelectorAll<HTMLButtonElement>("[data-assign-btn]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const recordId = Number(btn.dataset.recordId);
      const selectId = btn.dataset.selectId;
      const select = document.getElementById(selectId!) as HTMLSelectElement;
      const invgateId = Number(select?.value);

      if (!invgateId) {
        (window as any).showToast?.("Selecciona una mesa de ayuda primero", "alert-warning");
        return;
      }

      btn.disabled = true;
      btn.textContent = "...";

      try {
        const res = await fetch(`${cleanBase}api/support-guides/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId, invgate_id: invgateId }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error desconocido");
        }

        (window as any).showToast?.("Registro asignado correctamente", "alert-success");
        setTimeout(() => location.reload(), 800);
      } catch (err: any) {
        (window as any).showToast?.(err.message, "alert-error");
        btn.disabled = false;
        btn.textContent = "Asignar";
      }
    });
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/soportes/UnassignedRecords.astro
git commit -m "feat: add UnassignedRecords component for soportes migration"
```

---

### Task 6: Rewrite SoportesSkeleton

**Files:**
- Rewrite: `src/components/soportes/SoportesPublicSkeleton.astro`

- [ ] **Step 1: Replace with card skeletons**

Read the file first, then overwrite:

```astro
---
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
---

<PageContainer width="xxl">
  <PageHeader
    description="Matriz unificada de equivalencias y derivacion tecnica de la Mesa de Ayuda."
    class="max-w-2xl"
  />

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
    {Array.from({ length: 6 }).map(() => (
      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-5 gap-4">
          <div class="flex items-center gap-3">
            <div class="skeleton size-10 rounded-full shrink-0"></div>
            <div class="flex flex-col gap-2 flex-1">
              <div class="skeleton h-4 w-3/4 rounded"></div>
              <div class="skeleton h-3 w-1/2 rounded"></div>
            </div>
          </div>
          <div class="border-t border-base-200"></div>
          <div class="space-y-2">
            <div class="skeleton h-4 w-full rounded"></div>
            <div class="skeleton h-4 w-5/6 rounded"></div>
            <div class="skeleton h-4 w-2/3 rounded"></div>
          </div>
          <div class="flex justify-end gap-2">
            <div class="skeleton h-8 w-24 rounded"></div>
            <div class="skeleton h-8 w-24 rounded"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
</PageContainer>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/soportes/SoportesPublicSkeleton.astro
git commit -m "feat: rewrite SoportesSkeleton with card placeholders"
```

---

### Task 7: Rewrite SoportesContent (main component)

**Files:**
- Rewrite: `src/components/soportes/SoportesPublicContent.astro`

- [ ] **Step 1: Replace with new card grid logic**

Read the file first, then overwrite:

```astro
---
import { Icon } from "astro-icon/components";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import { invgateGet } from "@lib/invgateClient";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { asc } from "drizzle-orm";
import { isAllowed } from "@lib/rolesMatrix";
import HelpdeskCard from "./HelpdeskCard.astro";
import UnassignedRecords from "./UnassignedRecords.astro";
import type { InvgateHelpdesk } from "@/types/invgate";

const user = Astro.locals.user;
const isAdminUser = user ? isAllowed("Administrar Contenido", user.role) : false;

const hdResult = await invgateGet<InvgateHelpdesk[]>("helpdesks");
const invgateHelpdesks: InvgateHelpdesk[] =
  hdResult.ok && Array.isArray(hdResult.data) ? hdResult.data : [];
const invgateError = !hdResult.ok;

const helpdeskMap = new Map<number, InvgateHelpdesk>();
invgateHelpdesks.forEach((hd) => helpdeskMap.set(hd.id, hd));
const parentNameMap = new Map<number, string>();
invgateHelpdesks.forEach((hd) => {
  if (hd.parent_id && helpdeskMap.has(hd.parent_id)) {
    parentNameMap.set(hd.id, helpdeskMap.get(hd.parent_id)!.name);
  }
});

const guides = await db.query.supportGuides.findMany({
  orderBy: [asc(supportGuides.helpDeskName)],
});

const groupedRecords = new Map<number, typeof guides>();
const unassignedRecords: typeof guides = [];
const assignedInvgateIds = new Set<number>();

guides.forEach((g) => {
  if (g.invgate_id !== null) {
    assignedInvgateIds.add(g.invgate_id);
    const existing = groupedRecords.get(g.invgate_id) || [];
    existing.push(g);
    groupedRecords.set(g.invgate_id, existing);
  } else {
    unassignedRecords.push(g);
  }
});
---

<PageContainer width="xxl">
  <PageHeader
    description="Matriz unificada de equivalencias y derivacion tecnica de la Mesa de Ayuda."
    class="max-w-2xl"
  />

  {invgateError && (
    <div role="alert" class="alert alert-warning mt-4">
      <Icon name="boxicons:error-circle" size={20} />
      <span>No se pudo conectar con InvGate. Mostrando datos locales disponibles.</span>
    </div>
  )}

  <UnassignedRecords
    records={unassignedRecords}
    helpdesks={invgateHelpdesks}
    isAdmin={isAdminUser}
  />

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
    {invgateHelpdesks.map((hd) => {
      const records = groupedRecords.get(hd.id) || [];
      const parentName = parentNameMap.get(hd.id);
      return (
        <HelpdeskCard
          helpdesk={hd}
          records={records}
          isAdmin={isAdminUser}
          parentName={parentName}
        />
      );
    })}

    {invgateHelpdesks.length === 0 && guides.length === 0 && (
      <div class="col-span-full flex flex-col items-center gap-3 py-16 text-base-content/50">
        <div class="rounded-full bg-base-200 p-4">
          <Icon name="boxicons:buoy-filled" size={32} class="opacity-30" aria-hidden="true" />
        </div>
        <p class="text-sm font-semibold">No hay mesas de ayuda disponibles</p>
        <p class="text-xs">Verifica la conexion con InvGate o registra soportes manualmente.</p>
      </div>
    )}
  </div>
</PageContainer>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/soportes/SoportesPublicContent.astro
git commit -m "feat: rewrite SoportesContent with card grid from InvGate API"
```

---

### Task 8: Update /soportes/index.astro

**Files:**
- Modify: `src/pages/soportes/index.astro`

- [ ] **Step 1: Update imports (no structural change needed, same pattern)**

Read the file first. The current file already uses `server:defer` + skeleton. The component names are the same, so no changes needed. Verify it compiles:

```bash
npx tsc --noEmit src/pages/soportes/index.astro
```

- [ ] **Step 2: Commit (only if changed)**

```bash
git add src/pages/soportes/index.astro
git commit -m "chore: verify soportes index.astro compatible with new components"
```

---

### Task 9: Rewrite edit form /soportes/edit/[id].astro

**Files:**
- Rewrite: `src/pages/soportes/edit/[id].astro`

- [ ] **Step 1: Read current file, then rewrite with simplified fields**

Read the file first, then overwrite:

```astro
---
import { getCleanBase } from "@lib/baseUrl";
import BaseLayout from "@layouts/BaseLayout.astro";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import FormField from "@components/ui/forms/FormField.astro";
import FormTextarea from "@components/ui/forms/FormTextarea.astro";
import { Icon } from "astro-icon/components";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminFromAstro } from "@lib/auditLogger";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { invgateGet } from "@lib/invgateClient";
import type { InvgateHelpdesk } from "@/types/invgate";

const cleanBase = getCleanBase();
const { id } = Astro.params;

if (!id || (id !== "new" && isNaN(Number(id)))) {
  return Astro.redirect(`${cleanBase}soportes`);
}

const isNew = id === "new";
const numericId = isNew ? 0 : Number(id);

let errorMsg = "";

const hdResult = await invgateGet<InvgateHelpdesk[]>("helpdesks");
const invgateHelpdesks: InvgateHelpdesk[] =
  hdResult.ok && Array.isArray(hdResult.data) ? hdResult.data : [];

let guide: typeof supportGuides.$inferSelect | null = null;

if (!isNew) {
  guide = await db.query.supportGuides.findFirst({
    where: eq(supportGuides.id, numericId),
  });
  if (!guide) {
    return Astro.redirect(`${cleanBase}soportes`);
  }
}

const preselectedInvgateId = isNew
  ? Number(Astro.url.searchParams.get("invgate_id") || "0") || null
  : null;

if (Astro.request.method === "POST") {
  try {
    const data = await Astro.request.formData();
    const legacyName = data.get("legacyName")?.toString() || null;
    const categories = data.get("categories")?.toString() || null;
    const route = data.get("route")?.toString() || null;
    const topics = data.get("topics")?.toString() || null;
    const contacts = data.get("contacts")?.toString() || null;
    const referents = data.get("referents")?.toString() || null;
    const notes = data.get("notes")?.toString() || null;
    const invgateIdRaw = data.get("invgate_id")?.toString();
    const invgateId = invgateIdRaw ? Number(invgateIdRaw) || null : null;

    if (isNew) {
      const invgateName = invgateId
        ? invgateHelpdesks.find((h) => h.id === invgateId)?.name || null
        : null;
      const helpDeskName = invgateName || "Sin nombre InvGate";

      await db.insert(supportGuides).values({
        helpDeskName,
        legacyName,
        invgateName,
        invgate_id: invgateId,
        categories,
        route,
        topics,
        contacts,
        referents,
        notes,
      });

      await logAdminFromAstro(Astro.locals, `Creo informacion complementaria para la mesa de ayuda "${helpDeskName}"`);
      return redirectWithToast("/soportes", "Informacion agregada con exito.");
    } else {
      await db
        .update(supportGuides)
        .set({
          legacyName,
          categories,
          route,
          topics,
          contacts,
          referents,
          notes,
          invgate_id: invgateId ?? undefined,
        })
        .where(eq(supportGuides.id, numericId));

      const label = guide?.helpDeskName || `#${numericId}`;
      await logAdminFromAstro(Astro.locals, `Actualizo los datos de la mesa de ayuda "${label}"`);
      return redirectWithToast("/soportes", "Soporte actualizado con exito.");
    }
  } catch (err) {
    console.error("Error saving support guide:", err);
    errorMsg = "Ocurrio un error al guardar el registro.";
  }
}

const pageTitle = isNew ? "Nueva Informacion Complementaria" : `Editar: ${guide?.helpDeskName || ""}`;
const pageDesc = isNew
  ? "Agrega metadata local a una mesa de ayuda de InvGate."
  : "Modifica los campos de metadata local del soporte seleccionado.";
---

<BaseLayout>
  <PageContainer>
    <div class="mb-6">
      <a href={`${cleanBase}soportes`} class="btn btn-ghost btn-sm gap-2">
        <Icon name="boxicons:arrow-left" size={16} />
        Volver al listado
      </a>
    </div>

    <PageHeader title={pageTitle} description={pageDesc} />

    <div class="mt-8 bg-base-100 p-6 md:p-8 rounded-2xl shadow-sm border border-base-200">
      {errorMsg && (
        <script is:inline define:vars={{ errorMsg }}>
          window.addEventListener('load', () => window.showToast?.(errorMsg, "alert-error"));
        </script>
      )}

      <form method="POST" class="flex flex-col gap-6">
        {!isNew && guide?.invgate_id && (() => {
          const hd = invgateHelpdesks.find((h) => h.id === guide!.invgate_id);
          return hd ? (
            <div class="alert alert-soft text-sm">
              <Icon name="boxicons:buoy-filled" size={18} />
              <span>Mesa de ayuda InvGate vinculada: <strong>{hd.name}</strong> ({hd.total_members} miembros)</span>
            </div>
          ) : null;
        })()}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            id="legacyName"
            name="legacyName"
            label="Nombre Anterior (Service Manager)"
            value={guide?.legacyName || ""}
            placeholder="Ej: Soporte Tecnico N1"
          />

          <div class="form-control">
            <label class="label" for="invgate_id">
              <span class="label-text">Mesa de Ayuda InvGate</span>
            </label>
            <select
              id="invgate_id"
              name="invgate_id"
              class="select select-bordered w-full"
            >
              <option value="">Sin vincular</option>
              {invgateHelpdesks.map((hd) => {
                const selected = isNew
                  ? hd.id === preselectedInvgateId
                  : hd.id === guide?.invgate_id;
                return (
                  <option value={hd.id} selected={selected}>
                    {hd.name}
                  </option>
                );
              })}
            </select>
          </div>

          <FormField
            id="route"
            name="route"
            label="Ruta de Derivacion"
            value={guide?.route || ""}
            placeholder="Ej: N1 -> Redes -> Infraestructura"
          />
        </div>

        <FormTextarea
          id="categories"
          name="categories"
          label="Categorias InvGate (JSON array de IDs)"
          textareaClass="font-mono"
          rows={3}
          value={guide?.categories || ""}
          placeholder='[5, 12, 23]'
        />

        <FormTextarea
          id="topics"
          name="topics"
          label="Topicos (JSON array)"
          textareaClass="font-mono"
          rows={4}
          value={guide?.topics || ""}
          placeholder='["VPN", "Correo", "Hardware"]'
        />

        <FormTextarea
          id="contacts"
          name="contacts"
          label="Contactos"
          rows={4}
          value={guide?.contacts || ""}
        />

        <FormTextarea
          id="referents"
          name="referents"
          label="Referentes"
          rows={4}
          value={guide?.referents || ""}
        />

        <FormTextarea
          id="notes"
          name="notes"
          label="Notas"
          rows={4}
          value={guide?.notes || ""}
        />

        <div class="flex justify-end gap-3 mt-4 pt-6 border-t border-base-200">
          <a href={`${cleanBase}soportes`} class="btn btn-ghost">
            Cancelar
          </a>
          <button type="submit" class="btn btn-primary">
            <Icon name="boxicons:save" size={20} />
            {isNew ? "Agregar Informacion" : "Guardar Cambios"}
          </button>
        </div>
      </form>
    </div>
  </PageContainer>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/soportes/edit/[id].astro
git commit -m "feat: rewrite soportes edit form for metadata-only editing"
```

---

### Task 10: Delete orphaned files

**Files:**
- Delete: `src/pages/soportes/create.astro`
- Delete: `src/pages/soportes/edit/[id]/eliminar.ts`
- Delete: `src/components/admin/soportes/AdminSoportesContent.astro`
- Delete: `src/components/admin/soportes/AdminSoportesSkeleton.astro`
- Delete: `src/components/support-guides/SupportGuideRow.astro`

- [ ] **Step 1: Remove files**

```bash
Remove-Item "src/pages/soportes/create.astro"
Remove-Item "src/pages/soportes/edit/[id]/eliminar.ts" -Recurse
Remove-Item "src/components/admin/soportes/AdminSoportesContent.astro"
Remove-Item "src/components/admin/soportes/AdminSoportesSkeleton.astro"
Remove-Item "src/components/support-guides/SupportGuideRow.astro"
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove orphaned soportes create, delete, and admin components"
```

---

### Task 11: Update navigation, RBAC, and audit dictionary

**Files:**
- Modify: `src/lib/navigation.ts`
- Modify: `src/lib/rbac.ts`
- Modify: `src/lib/auditDictionary.ts`

- [ ] **Step 1: Add /soportes to navigation**

In `src/lib/navigation.ts`, add to the "Accesos rápidos" section, after "Contactos":

```typescript
{
  href: "/soportes",
  label: "Soportes",
  icon: "boxicons:buoy-filled",
},
```

Insert it in the `accesos-rapidos` items array, between the "Contactos" entry and before the closing `]` of items.

- [ ] **Step 2: Remove /soportes/create from RBAC**

In `src/lib/rbac.ts`, remove the line:
```typescript
{ path: "/soportes/create", roles: ["admin", "supervisor"] },
```

Keep the line `{ path: "/soportes/edit", roles: ["admin", "supervisor"] }`.

- [ ] **Step 3: Update audit dictionary**

In `src/lib/auditDictionary.ts`, remove the `soportes.create` and `soportes.delete` entries. The `soportes` section should become:

```typescript
soportes: {
  update: (username: string, helpDeskName: string) =>
    `${username} ha modificado los datos de la mesa de ayuda ${helpDeskName}.`,
},
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/navigation.ts src/lib/rbac.ts src/lib/auditDictionary.ts
git commit -m "feat: add soportes to nav, remove create RBAC, update audit dict"
```

---

### Task 12: Push database schema and verify build

- [ ] **Step 1: Push DB schema**

```bash
npm run db:push
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

If errors, fix them before proceeding.

- [ ] **Step 3: Run Astro build**

```bash
npm run build
```

Expected: successful build with no errors.

- [ ] **Step 4: Start dev server and smoke test**

```bash
npm run dev
```

Navigate to `http://localhost:4321/soportes` and verify:
- Card grid renders
- InvGate helpdesk names appear on cards
- Admin sees edit buttons and "Registros sin asignar" section
- Non-admin sees only "Ver mas" buttons
- Modal opens with contacts/referents/notes

- [ ] **Step 5: Commit any fixes from build verification**

```bash
git add -A
git commit -m "chore: build verification fixes"
```

---

### Task 13: Run E2E tests

- [ ] **Step 1: Ensure dev server is running**

```bash
# In a separate terminal or background
npm run dev
```

- [ ] **Step 2: Run Playwright tests**

```bash
npx playwright test
```

If any tests fail due to the route changes (e.g., tests that navigate to `/soportes/create`), update the test file at `tests/admin/rbac.spec.ts` to remove references to the deleted route.

- [ ] **Step 3: Commit test fixes if needed**

```bash
git add tests/
git commit -m "test: update RBAC tests for removed soportes/create route"
```
