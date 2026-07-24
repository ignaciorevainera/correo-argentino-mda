# Filtro de Oficinas Cerradas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un switch en el panel de administración de oficinas para filtrar y mostrar únicamente las sucursales que se encuentran cerradas (inactivas), ocultándolo automáticamente si no hay ninguna.

**Architecture:** Se añadirá una nueva función en las consultas a la base de datos para verificar la existencia de oficinas inactivas. Luego, se ajustará `getOffices` para soportar un filtro por estado. En la interfaz (`AdminOfficesContent.astro`), se renderizará el switch condicionalmente y se conectará su estado con la API mediante los parámetros de URL existentes.

**Tech Stack:** Astro, Drizzle ORM, TailwindCSS, DaisyUI, TypeScript

---

## User Review Required

- **Comportamiento por defecto:** Actualmente el listado muestra TODAS las oficinas (activas y cerradas). Si el switch está apagado (comportamiento por defecto), ¿deberían mostrarse *solo las activas* o *todas*? En este plan, asumo que por defecto mostramos *todas*, y al encender el switch se muestran *solo las cerradas*. Si prefieres que el estado normal muestre solo las activas, házmelo saber.

## Open Questions

Ninguna adicional. 

## Proposed Changes

---

### Task 1: Actualizar Lógica de Base de Datos (Queries)

**Files:**
- Modify: `src/lib/officeQueries.ts`

- [ ] **Step 1: Añadir función `hasClosedOffices` y actualizar parámetros**

Añadir al principio (o exportar junto al resto) la función para chequear si hay oficinas cerradas.
Actualizar `GetOfficesParams`.

```typescript
export async function hasClosedOffices() {
  const [{ count }] = await db
    .select({ count: sql<number>\`count(*)\` })
    .from(offices)
    .where(eq(offices.active, false));
  return count > 0;
}
```

Añadir a `GetOfficesParams`:
```typescript
export interface GetOfficesParams {
  // ...
  paqar?: string;
  status?: "all" | "active" | "closed";
  // ...
}
```

- [ ] **Step 2: Implementar el filtro en `getOffices`**

En `src/lib/officeQueries.ts`, donde se inicializan las condiciones (`const whereConditions = [];`), añadir:

```typescript
  const statusFilter = params.status || "all";

  if (statusFilter === "active") {
    whereConditions.push(eq(offices.active, true));
  } else if (statusFilter === "closed") {
    whereConditions.push(eq(offices.active, false));
  }
```

---

### Task 2: Actualizar el Endpoint de la API

**Files:**
- Modify: `src/pages/api/offices/index.astro`

- [ ] **Step 1: Añadir la extracción del parámetro `status`**

```typescript
const paqar = searchParams.get("paqar") || "all";
const status = (searchParams.get("status") as "all" | "active" | "closed") || "all";
```

- [ ] **Step 2: Pasarlo a `getOffices`**

```typescript
const {
  data: offices,
  count,
  hasMore,
} = await getOffices({
  // ...
  paqar,
  status,
  // ...
});
```

---

### Task 3: Actualizar la Interfaz de Administración

**Files:**
- Modify: `src/components/admin/offices/AdminOfficesContent.astro`

- [ ] **Step 1: Obtener el valor de `hasClosedOffices` y el parámetro de URL actual**

En el frontmatter del archivo, añadir la importación y la llamada:

```typescript
import { getOffices, hasClosedOffices } from "@lib/officeQueries";
// ...

const anyClosedOffices = await hasClosedOffices();
const statusFilter = Astro.url.searchParams.get("status") || "all";

// ... Y pasar statusFilter a getOffices:
const { data: allOffices, count: totalOfficesCount, hasMore } = await getOffices({
  // ...
  paqar: paqarFilter,
  status: statusFilter as "all" | "active" | "closed",
});
```

- [ ] **Step 2: Renderizar el switch condicionalmente**

En el HTML, dentro de la sección de filtros (debajo del input de búsqueda o junto a los selects), añadir:

```html
      {anyClosedOffices && (
        <div class="flex items-center gap-2">
          <label class="label cursor-pointer gap-2">
            <span class="label-text whitespace-nowrap">Cerradas</span>
            <input 
              type="checkbox" 
              id="admin-office-closed-filter"
              class="toggle toggle-primary toggle-sm" 
              checked={statusFilter === "closed"}
            />
          </label>
        </div>
      )}
```

- [ ] **Step 3: Actualizar el script de filtrado en el cliente**

En el tag `<script>` al final, incluir la lógica del checkbox:

```javascript
    const closedFilter = document.querySelector("#admin-office-closed-filter");
    let activeStatus = new URLSearchParams(window.location.search).get("status") || "all";

    // ... Dentro de getQueryParams:
    if (activeStatus !== "all") params.set("status", activeStatus);

    // ... Dentro de updateURL:
    if (activeStatus !== "all") params.set("status", activeStatus);

    // ... Donde se definen los eventos:
    closedFilter?.addEventListener("change", (e) => {
      activeStatus = e.target.checked ? "closed" : "all";
      onFilterChange();
    });

    // ... En el listener de clearBtn:
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        // ...
        activeStatus = "all";
        if (closedFilter) closedFilter.checked = false;
        // ...
      });
    }
```

---

### Task 4: Revisión Visual y de Etiqueta (Opcional)

Si el frontend (ej. `AdminOfficeRow.astro`) no muestra que una oficina está cerrada cuando `active` es `false`, se podría añadir un indicador (como un badge gris o un texto tachado) para que quede claro que esa oficina fue dada de baja, pero ya que no fue solicitado explícitamente, se omite de los pasos críticos.

## Verification Plan

### Automated Tests
- No aplican pruebas unitarias automatizadas para este cambio en la infraestructura actual.

### Manual Verification
1. Abrir SQLite en `database/mda.db` y forzar al menos una oficina a estar cerrada: `UPDATE offices SET active = 0 LIMIT 1;`.
2. Ingresar a `/admin/oficinas`.
3. Comprobar que el switch "Cerradas" aparece.
4. Activarlo y verificar que la URL se actualiza (`?status=closed`) y que en pantalla solo figura la oficina modificada.
5. Volver a activarla: `UPDATE offices SET active = 1;` y refrescar.
6. Comprobar que el switch desaparece ya que no hay registros que coincidan.
