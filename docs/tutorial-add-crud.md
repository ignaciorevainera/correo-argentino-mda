# Tutorial: Agregar un CRUD admin

Vas a agregar un panel de administración completo (listar, crear, editar, eliminar) para la entidad **feriados** — que ya existe en la base de datos pero no tiene interfaz admin.

Al finalizar, el panel admin tendrá una nueva sección "Feriados" con tabla, búsqueda, formularios y eliminación.

---

## Archivos a crear (6)

```
src/
├── pages/admin/feriados/
│   ├── index.astro                    ← Page shell
│   ├── create.astro                   ← Formulario de creación
│   └── edit/
│       ├── [id].astro                 ← Formulario de edición
│       └── [id]/eliminar.ts           ← Endpoint de eliminación
└── components/admin/feriados/
    ├── AdminFeriadosContent.astro     ← Tabla con datos
    └── AdminFeriadosSkeleton.astro    ← Esqueleto de carga
```

## Archivos a modificar (1)

```
src/lib/navigation.ts                  ← Agregar ruta al sidebar admin
```

---

## 1. Registrar la ruta en `navigation.ts`

Agregá esta entrada dentro del array `children` de la sección admin (después de `contactos`, por orden alfabético):

```typescript
{
  href: "/admin/feriados",
  label: "Feriados",
  icon: "boxicons:calendar-filled",
},
```

Esto hace que la ruta aparezca en el sidebar, el header y la command palette automáticamente.

---

## 2. Page shell — `pages/admin/feriados/index.astro`

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import AdminFeriadosContent from "@components/admin/feriados/AdminFeriadosContent.astro";
import AdminFeriadosSkeleton from "@components/admin/feriados/AdminFeriadosSkeleton.astro";
---
<BaseLayout>
  <AdminFeriadosContent server:defer>
    <AdminFeriadosSkeleton slot="fallback" />
  </AdminFeriadosContent>
</BaseLayout>
```

11 líneas. El `server:defer` hace que el contenido pesado (consulta a DB) se ejecute en una request separada, mientras el skeleton se muestra al instante.

---

## 3. Content — `components/admin/feriados/AdminFeriadosContent.astro`

```astro
---
import { getCleanBase } from "@lib/baseUrl";
import { db } from "@db/index";
import { holidays } from "@db/schema";
import { asc } from "drizzle-orm";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import DataTable from "@components/ui/DataTable.astro";
import DataTableHeaderCell from "@components/ui/DataTableHeaderCell.astro";
import SearchBar from "@components/ui/SearchBar.astro";
import { Icon } from "astro-icon/components";
import ActionEditButton from "@components/ui/ActionEditButton.astro";
import ActionDeleteButton from "@components/ui/ActionDeleteButton.astro";

const cleanBase = getCleanBase();

const allHolidays = await db
  .select({ id: holidays.id, date: holidays.date, name: holidays.name })
  .from(holidays)
  .orderBy(asc(holidays.date));

const headerGridClass = "grid-cols-[80px_1fr_1.5fr_100px] gap-4";
const rowGridClass =
  "grid grid-cols-[80px_1fr_1.5fr_100px] items-center gap-4";
---

<PageContainer>
  <PageHeader
    title="Gestión de feriados"
    description="Administración del calendario de feriados del portal."
  />

  <div
    class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
  >
    <div class="flex items-center gap-3">
      <h2 class="text-lg font-semibold text-base-content">
        Feriados registrados
      </h2>
      {
        allHolidays.length > 0 && (
          <span
            id="holiday-count-badge"
            class="badge badge-neutral badge-sm font-mono"
          >
            {allHolidays.length}
          </span>
        )
      }
    </div>

    <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
      <SearchBar
        id="admin-holiday-search"
        label="Buscar feriado"
        placeholder="Buscar por nombre o fecha"
        class="w-full sm:w-64"
      />
      <a
        href={`${cleanBase}admin/feriados/create`}
        class="btn btn-secondary rounded-lg font-medium normal-case transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent w-full sm:w-auto"
      >
        <Icon name="boxicons:plus" size={18} />
        Nuevo feriado
      </a>
    </div>
  </div>

  <DataTable
    ariaLabel="Listado de feriados registrados"
    minWidthClass="min-w-200"
    headerGridClass={headerGridClass}
    rowGridClass={rowGridClass}
    emptyStateTitle="No hay coincidencias"
    emptyStateDescription="No hay feriados que coincidan con la búsqueda."
    showClearButton={true}
    clearButtonHref={`${cleanBase}admin/feriados`}
  >
    <div slot="header">
      <DataTableHeaderCell sortKey="id">ID</DataTableHeaderCell>
    </div>
    <div slot="header">
      <DataTableHeaderCell sortKey="date">Fecha</DataTableHeaderCell>
    </div>
    <div slot="header">
      <DataTableHeaderCell sortKey="name">Nombre</DataTableHeaderCell>
    </div>
    <div slot="header" class="text-right">
      <DataTableHeaderCell align="right">Acciones</DataTableHeaderCell>
    </div>

    {
      allHolidays.length === 0 ? (
        <div class="flex flex-col items-center gap-3 py-16 text-base-content/50">
          <div class="rounded-full bg-base-200 p-4">
            <Icon
              name="boxicons:calendar-filled"
              size={32}
              class="opacity-30"
              aria-hidden="true"
            />
          </div>
          <div class="space-y-1 text-center">
            <p class="text-sm font-semibold">No hay feriados registrados</p>
            <p class="text-xs">
              Cargá el primer feriado desde el botón superior.
            </p>
          </div>
        </div>
      ) : (
        <>
          {allHolidays.map((h) => (
            <article
              data-table-row
              data-sort-id={h.id}
              data-sort-date={h.date}
              data-sort-name={h.name}
              data-search-text={`${h.id} ${h.date} ${h.name}`.toLowerCase()}
              class:list={[
                rowGridClass,
                "border-b border-base-300 px-4 py-3 transition-colors hover:bg-base-200/50 last:border-b-0",
              ]}
            >
              <div>
                <span
                  class="rounded-md bg-base-200 px-2 py-1 font-mono text-sm font-semibold text-base-content"
                >
                  {h.id}
                </span>
              </div>

              <div class="min-w-0">
                <span
                  data-highlight-target
                  class="truncate text-sm font-semibold text-base-content"
                >
                  {h.date}
                </span>
              </div>

              <div class="min-w-0">
                <span
                  data-highlight-target
                  class="truncate text-sm text-base-content/70"
                >
                  {h.name}
                </span>
              </div>

              <div class="flex items-center justify-end gap-2">
                <ActionEditButton
                  href={`${cleanBase}admin/feriados/edit/${h.id}`}
                  ariaLabel={`Editar ${h.name}`}
                />

                <form
                  method="POST"
                  action={`${cleanBase}admin/feriados/edit/${h.id}/eliminar`}
                  class="inline"
                  onsubmit="return confirm('¿Estás seguro de que querés eliminar este feriado?')"
                >
                  <ActionDeleteButton
                    ariaLabel={`Eliminar ${h.name}`}
                  />
                </form>
              </div>
            </article>
          ))}
        </>
      )
    }
  </DataTable>
</PageContainer>

<script>
  import {
    matchesSearchQuery,
    highlightSearchTargets,
  } from "@lib/clientSearch";

  function initSearch() {
    const searchInput = document.querySelector<HTMLInputElement>(
      "#admin-holiday-search",
    );
    if (!searchInput) return false;

    const rows = document.querySelectorAll<HTMLElement>("[data-table-row]");
    const countBadge = document.querySelector<HTMLElement>(
      "#holiday-count-badge",
    );

    function applyFilters() {
      const query = searchInput?.value.trim();
      let visibleCount = 0;

      rows.forEach((row) => {
        const searchText = row.dataset.searchText || "";
        const isVisible = matchesSearchQuery(query, [searchText]);

        row.classList.toggle("hidden", !isVisible);
        highlightSearchTargets(row, isVisible ? query : "");

        if (isVisible) visibleCount++;
      });

      if (countBadge) {
        countBadge.textContent = visibleCount.toString();
      }
    }

    searchInput.addEventListener("input", applyFilters);
    return true;
  }

  function setupSearchObserver() {
    if (initSearch()) return;
    const observer = new MutationObserver((_, obs) => {
      if (initSearch()) obs.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  setupSearchObserver();
  document.addEventListener("astro:page-load", () => setupSearchObserver());
</script>
```

Puntos clave:
- `headerGridClass` y `rowGridClass` usan las mismas columnas
- Cada fila tiene `data-sort-id`, `data-sort-date`, `data-sort-name` y `data-search-text`
- El `<script>` de búsqueda es copia exacta del patrón usado en otros admin CRUDs

---

## 4. Skeleton — `components/admin/feriados/AdminFeriadosSkeleton.astro`

```astro
---
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import DataTable from "@components/ui/DataTable.astro";
import DataTableHeaderCell from "@components/ui/DataTableHeaderCell.astro";

const headerGridClass = "grid-cols-[80px_1fr_1.5fr_100px] gap-4";
const rowGridClass =
  "grid grid-cols-[80px_1fr_1.5fr_100px] items-center gap-4";
---

<PageContainer>
  <div class="skeleton-debounced">
    <PageHeader
      title="Gestión de feriados"
      description="Administración del calendario de feriados del portal."
    />

    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold text-base-content">
          Feriados registrados
        </h2>
        <div class="h-5 w-8 skeleton rounded-full"></div>
      </div>

      <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        <div class="h-10 w-full sm:w-64 skeleton rounded-lg"></div>
        <div class="h-10 w-full sm:w-36 skeleton rounded-lg"></div>
      </div>
    </div>

    <DataTable
      ariaLabel="Cargando feriados..."
      minWidthClass="min-w-200"
      headerGridClass={headerGridClass}
      rowGridClass={rowGridClass}
      class="mt-4"
    >
      <div slot="header">
        <DataTableHeaderCell sortKey="id">ID</DataTableHeaderCell>
      </div>
      <div slot="header">
        <DataTableHeaderCell sortKey="date">Fecha</DataTableHeaderCell>
      </div>
      <div slot="header">
        <DataTableHeaderCell sortKey="name">Nombre</DataTableHeaderCell>
      </div>
      <div slot="header" class="text-right">
        <DataTableHeaderCell align="right">Acciones</DataTableHeaderCell>
      </div>

      {
        Array.from({ length: 5 }).map(() => (
          <div
            class:list={[
              rowGridClass,
              "border-b border-base-300 px-4 py-4 last:border-b-0",
            ]}
          >
            <div class="h-6 w-12 skeleton rounded-md" />
            <div class="h-4 w-28 skeleton rounded" />
            <div class="h-4 w-40 skeleton rounded" />
            <div class="flex justify-end gap-2">
              <div class="h-7 w-16 skeleton rounded-lg" />
              <div class="h-7 w-16 skeleton rounded-lg" />
            </div>
          </div>
        ))
      }
    </DataTable>
  </div>
</PageContainer>
```

**Regla crítica:** `headerGridClass` y `rowGridClass` deben coincidir exactamente con los del Content. Si difieren, el layout se rompe durante la carga.

---

## 5. Create — `pages/admin/feriados/create.astro`

```astro
---
import { db } from "@db/index";
import { holidays } from "@db/schema";
import BaseLayout from "@layouts/BaseLayout.astro";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import FormField from "@components/ui/forms/FormField.astro";
import { Icon } from "astro-icon/components";
import { logAdminFromAstro } from "@lib/auditLogger";
import AsyncFormScript from "@components/admin/ui/AsyncFormScript.astro";
import SectionCard from "@components/ui/SectionCard.astro";
import { resolveUrl } from "@lib/url";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { toastResponse } from "@lib/api/toastResponse";
import ActionCancelButton from "@components/ui/ActionCancelButton.astro";
import ActionConfirmButton from "@components/ui/ActionConfirmButton.astro";

let errorMsg = "";

if (Astro.request.method === "POST") {
  const isAjax = Astro.request.headers.get('accept')?.includes('application/json');
  try {
    const fd = await Astro.request.formData();
    const date = fd.get("date")?.toString().trim() ?? "";
    const name = fd.get("name")?.toString().trim() ?? "";

    if (!date || !name) {
      errorMsg = "La fecha y el nombre son obligatorios.";
    } else {
      await db.insert(holidays).values({ date, name });
      await logAdminFromAstro(Astro.locals, `Creó el feriado "${name}" (${date})`);

      const toastMessage = "Feriado creado con éxito.";
      if (isAjax) {
        return toastResponse({ success: true, message: toastMessage, redirectUrl: resolveUrl("/admin/feriados") });
      }
      return redirectWithToast("/admin/feriados", toastMessage);
    }
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) {
      errorMsg = "Ya existe un feriado con esa fecha.";
    } else {
      errorMsg = "Error al guardar el feriado.";
    }
    if (isAjax) {
      return toastResponse({ success: false, error: errorMsg });
    }
  }
}
---

<BaseLayout title="Nuevo feriado">
  <PageContainer>
    <div class="flex items-center gap-2 text-sm text-base-content/60">
      <a
        href={resolveUrl("/admin/feriados")}
        class="flex items-center gap-1.5 hover:text-base-content transition-colors"
      >
        <Icon name="boxicons:chevron-left" size={16} />
        Feriados
      </a>
      <span>/</span>
      <span class="text-base-content font-medium truncate">Nuevo feriado</span>
    </div>

    <PageHeader
      title="Nuevo feriado"
      description="Agregá una fecha al calendario de feriados."
    />

    {
      errorMsg && (
        <script is:inline define:vars={{ errorMsg }}>
          window.addEventListener('load', () => window.showToast?.(errorMsg, "alert-error"));
        </script>
      )
    }

    <form method="POST" data-async-form class="space-y-4">
      <SectionCard class="shadow-md">
          <h2
            class="flex items-center gap-2 text-sm font-semibold text-base-content"
          >
            <span
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/10 text-secondary"
            >
              <Icon name="boxicons:calendar-filled" size={15} />
            </span>
            Datos del feriado
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              id="input-date"
              name="date"
              type="date"
              label="Fecha"
              required
              autofocus
            />

            <FormField
              id="input-name"
              name="name"
              label="Nombre"
              required
              placeholder="ej: Día de la Independencia"
              autocomplete="off"
            />
          </div>
      </SectionCard>

      <div class="flex items-center justify-between gap-3 pt-1">
        <ActionCancelButton
          href={resolveUrl("/admin/feriados")}
          label="Volver al listado"
          icon="boxicons:arrow-left-filled"
        />
        <ActionConfirmButton
          type="submit"
          color="btn-secondary"
          label="Crear feriado"
          icon="boxicons:save-filled"
        />
      </div>
    </form>
  </PageContainer>
  <AsyncFormScript />
</BaseLayout>
```

Notas sobre el patrón:
- El POST handler está al inicio del frontmatter
- Maneja respuesta dual: JSON (AJAX) o redirect (formulario tradicional)
- `logAdminFromAstro` se llama después del `db.insert()` exitoso
- `data-async-form` en el `<form>` habilita el submit AJAX

---

## 6. Edit — `pages/admin/feriados/edit/[id].astro`

```astro
---
import { db } from "@db/index";
import { holidays } from "@db/schema";
import { eq } from "drizzle-orm";
import BaseLayout from "@layouts/BaseLayout.astro";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import FormField from "@components/ui/forms/FormField.astro";
import { Icon } from "astro-icon/components";
import { logAdminFromAstro } from "@lib/auditLogger";
import AsyncFormScript from "@components/admin/ui/AsyncFormScript.astro";
import SectionCard from "@components/ui/SectionCard.astro";
import { resolveUrl } from "@lib/url";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { toastResponse } from "@lib/api/toastResponse";
import ActionCancelButton from "@components/ui/ActionCancelButton.astro";
import ActionConfirmButton from "@components/ui/ActionConfirmButton.astro";

const { id } = Astro.params;
let errorMsg = "";

if (!id || isNaN(Number(id))) {
  return Astro.redirect(resolveUrl("/admin/feriados"));
}

const [holiday] = await db
  .select({ id: holidays.id, date: holidays.date, name: holidays.name })
  .from(holidays)
  .where(eq(holidays.id, Number(id)));

if (!holiday) {
  return Astro.redirect(resolveUrl("/admin/feriados"));
}

if (Astro.request.method === "POST") {
  const isAjax = Astro.request.headers.get('accept')?.includes('application/json');
  try {
    const fd = await Astro.request.formData();
    const date = fd.get("date")?.toString().trim() ?? "";
    const name = fd.get("name")?.toString().trim() ?? "";

    if (!date || !name) {
      errorMsg = "La fecha y el nombre son obligatorios.";
    } else {
      await db
        .update(holidays)
        .set({ date, name })
        .where(eq(holidays.id, Number(id)));

      await logAdminFromAstro(Astro.locals, `Actualizó el feriado "${name}" (${date})`);

      if (isAjax) {
        return toastResponse({ success: true, message: "Feriado actualizado con éxito.", redirectUrl: resolveUrl("/admin/feriados") });
      }
      return redirectWithToast("/admin/feriados", "Feriado actualizado con éxito.");
    }
  } catch (e: any) {
    if (isAjax) {
      return toastResponse({ success: false, error: e.message || "Error al actualizar." });
    }
    errorMsg = "Error al actualizar el feriado.";
  }
}
---

<BaseLayout title={`Editar: ${holiday.name}`}>
  <PageContainer>
    <div class="flex items-center gap-2 text-sm text-base-content/60">
      <a
        href={resolveUrl("/admin/feriados")}
        class="flex items-center gap-1.5 hover:text-base-content transition-colors"
      >
        <Icon name="boxicons:chevron-left" size={16} />
        Feriados
      </a>
      <span>/</span>
      <span class="text-base-content font-medium truncate">Editar: {holiday.name}</span>
    </div>

    <PageHeader
      title={`Editar: ${holiday.name}`}
      description={`ID de base de datos: ${holiday.id}`}
    />

    {
      errorMsg && (
        <script is:inline define:vars={{ errorMsg }}>
          window.addEventListener('load', () => window.showToast?.(errorMsg, "alert-error"));
        </script>
      )
    }

    <form method="POST" data-async-form class="space-y-4">
      <SectionCard class="shadow-md">
          <h2
            class="flex items-center gap-2 text-sm font-semibold text-base-content"
          >
            <span
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/10 text-secondary"
            >
              <Icon name="boxicons:calendar-filled" size={15} />
            </span>
            Datos del feriado
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              id="input-date"
              name="date"
              type="date"
              label="Fecha"
              required
              value={holiday.date}
            />

            <FormField
              id="input-name"
              name="name"
              label="Nombre"
              required
              value={holiday.name}
              placeholder="ej: Día de la Independencia"
              autocomplete="off"
            />
          </div>
      </SectionCard>

      <div class="flex items-center justify-between gap-3 pt-1">
        <ActionCancelButton
          href={resolveUrl("/admin/feriados")}
          label="Volver al listado"
          icon="boxicons:arrow-left-filled"
        />
        <ActionConfirmButton
          type="submit"
          color="btn-primary"
          label="Guardar cambios"
          icon="boxicons:save-filled"
        />
      </div>
    </form>
  </PageContainer>
  <AsyncFormScript />
</BaseLayout>
```

Diferencias clave con Create:
- Tiene un `SELECT` inicial para pre-fill del formulario (`holiday.date`, `holiday.name`)
- Si el registro no existe, redirige al listado
- Usa `db.update()` en vez de `db.insert()`
- El título de la página dice "Editar: {nombre}"

---

## 7. Eliminar — `pages/admin/feriados/edit/[id]/eliminar.ts`

Es un archivo `.ts`, no `.astro`. No lleva frontmatter (`---`).

```typescript
import { db } from "@db/index";
import { holidays } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "feriado",
  redirectPath: "admin/feriados",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(holidays)
      .where(eq(holidays.id, id))
      .returning({ name: holidays.name, date: holidays.date });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Feriado "${(d as any).name}" (${(d as any).date}) eliminado con éxito.`
    : "Feriado eliminado con éxito.",
  logMessage: (d) => d
    ? `Eliminó el feriado "${(d as any).name}" (${(d as any).date})`
    : undefined,
});
```

El `createDeleteHandler` se encarga de todo: validar ID, eliminar, loguear en auditoría y redirigir con toast.

---

## Resultado final

Una vez creados los 6 archivos, verificá:

- [ ] `src/lib/navigation.ts` tiene la nueva entrada `/admin/feriados`
- [ ] `headerGridClass` y `rowGridClass` son idénticos en Content y Skeleton
- [ ] Toda mutación llama `logAdminFromAstro()` antes de responder
- [ ] `data-async-form` está en los formularios
- [ ] `<AsyncFormScript />` está al final de ambos formularios
- [ ] Los botones de eliminar tienen `onsubmit="return confirm(...)"`
- [ ] El servidor compila sin errores (`npm run build`)
- [ ] La ruta aparece en el sidebar admin y funciona la navegación
