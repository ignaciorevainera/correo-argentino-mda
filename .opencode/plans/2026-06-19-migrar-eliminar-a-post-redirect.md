# Migrar Eliminación de Oficinas, Soportes y Cubics a POST + Redirect

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar las 3 entidades públicas (oficinas, soportes, cubics) del patrón `fetch DELETE` + JS a `form POST` + redirect con toast, unificando con el resto del admin.

**Architecture:** Cada entidad recibe un archivo `edit/[id]/eliminar.ts` con un handler POST que elimina el registro y redirige al listado con `toast_msg`/`toast_type` en la URL. Los botones de eliminar en los componentes se envuelven en un `<form method="POST" class="inline">` con `onsubmit="return confirm(...)"`. El `BaseLayout` ya procesa estos query params para mostrar toasts automáticamente. Los handlers `DELETE` de API y su JS asociado se eliminan.

**Tech Stack:** Astro SSR (APIRoute), Drizzle ORM, DaisyUI, BaseLayout toast system

---

## File Structure

### Archivos a crear (3)

| Archivo | Responsabilidad |
|---------|----------------|
| `src/pages/oficinas/edit/[id]/eliminar.ts` | Handler POST que elimina una oficina por ID y redirige |
| `src/pages/soportes/edit/[id]/eliminar.ts` | Handler POST que elimina un soporte por ID y redirige |
| `src/pages/inventario-terminales/cubics/edit/[id]/eliminar.ts` | Handler POST que elimina un cubic por ID y redirige |

### Archivos a modificar (5)

| Archivo | Cambio |
|---------|--------|
| `src/components/offices/OfficeRow.astro:200-208` | Reemplazar `<button>` por `<form method="POST">` + `<button type="submit">` |
| `src/components/inventario/InventarioContent.astro:640-647` | Reemplazar `<button>` por `<form method="POST">` + `<button type="submit">` |
| `src/components/inventario/InventarioContent.astro:1028-1060` | Eliminar el event listener que hace fetch DELETE a `/api/cubics/[id]` |
| `src/components/support-guides/SupportGuideRow.astro:129-136` | Reemplazar `<button>` por `<form method="POST">` + `<button type="submit">` |
| `src/components/offices/DirectorioContent.astro:710-749` | Eliminar el event listener que hace fetch DELETE a `/api/oficinas/[id]` |
| `src/components/soportes/SoportesPublicContent.astro:295-351` | Eliminar el event listener que hace fetch DELETE a `/api/soportes/[id]` |

### Archivos a eliminar (3, cleanup opcional)

| Archivo | Motivo |
|---------|--------|
| `src/pages/api/oficinas/[id].ts` | Contiene solo DELETE handler, reemplazado por POST |
| `src/pages/api/soportes/[id].ts` | Contiene solo DELETE handler, reemplazado por POST |
| `src/pages/api/cubics/[id].ts` | Contiene solo DELETE handler, reemplazado por POST |

---

## Task 1: Crear eliminar.ts para Oficinas

**Files:**
- Create: `src/pages/oficinas/edit/[id]/eliminar.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { offices } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const user = locals.user;
  if (!user || !isAllowed("Administrar Contenido", user.role)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`);
  }

  const officeId = Number(params.id);
  if (!officeId || isNaN(officeId)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("ID de oficina no proporcionado")}&toast_type=error`);
  }

  try {
    const [deleted] = await db
      .delete(offices)
      .where(eq(offices.id, officeId))
      .returning({ code: offices.code, name: offices.name });

    if (deleted) {
      await logAdminAction(
        user.username || "Sistema",
        `Eliminó la oficina "${deleted.name}" (${deleted.code})`
      );
    }

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;

    if (deleted) {
      return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent(`Oficina "${deleted.name}" (${deleted.code}) eliminada con éxito.`)}&toast_type=success`);
    } else {
      return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("La oficina no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error deleting office:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/oficinas?toast_msg=${encodeURIComponent("Error al eliminar la oficina")}&toast_type=error`);
  }
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/pages/oficinas/edit/\[id\]/eliminar.ts
git commit -m "feat(oficinas): add POST eliminar handler for offices"
```

---

## Task 2: Crear eliminar.ts para Soportes

**Files:**
- Create: `src/pages/soportes/edit/[id]/eliminar.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const user = locals.user;
  if (!user || !isAllowed("Administrar Contenido", user.role)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`);
  }

  const guideId = Number(params.id);
  if (!guideId || isNaN(guideId)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("ID de soporte no proporcionado")}&toast_type=error`);
  }

  try {
    const [deleted] = await db
      .delete(supportGuides)
      .where(eq(supportGuides.id, guideId))
      .returning({ helpDeskName: supportGuides.helpDeskName });

    if (deleted) {
      await logAdminAction(
        user.username || "Sistema",
        `Eliminó el soporte "${deleted.helpDeskName}"`
      );
    }

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;

    if (deleted) {
      return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent(`Soporte "${deleted.helpDeskName}" eliminado con éxito.`)}&toast_type=success`);
    } else {
      return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("El soporte no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error deleting support guide:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/soportes?toast_msg=${encodeURIComponent("Error al eliminar el soporte")}&toast_type=error`);
  }
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/pages/soportes/edit/\[id\]/eliminar.ts
git commit -m "feat(soportes): add POST eliminar handler for support guides"
```

---

## Task 3: Crear eliminar.ts para Cubics

**Files:**
- Create: `src/pages/inventario-terminales/cubics/edit/[id]/eliminar.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { cubics, cubicAssignments } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const user = locals.user;
  if (!user || !isAllowed("Administrar Contenido", user.role)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("No autorizado")}&toast_type=error`);
  }

  const cubicId = Number(params.id);
  if (!cubicId || isNaN(cubicId)) {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("ID de cubic no proporcionado")}&toast_type=error`);
  }

  try {
    await db.delete(cubicAssignments).where(eq(cubicAssignments.cubicId, cubicId));

    const [deleted] = await db
      .delete(cubics)
      .where(eq(cubics.id, cubicId))
      .returning({ name: cubics.name });

    if (deleted) {
      await logAdminAction(
        user.username || "Sistema",
        `Eliminó el cubic "${deleted.name}"`
      );
    }

    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;

    if (deleted) {
      return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent(`Ordenador "${deleted.name}" dado de baja con éxito.`)}&toast_type=success`);
    } else {
      return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("El cubic no existe.")}&toast_type=error`);
    }
  } catch (error) {
    console.error("Error deleting cubic:", error);
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return redirect(`${cleanBase}/inventario-terminales?toast_msg=${encodeURIComponent("Error al eliminar el cubic")}&toast_type=error`);
  }
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/pages/inventario-terminales/cubics/edit/\[id\]/eliminar.ts
git commit -m "feat(cubics): add POST eliminar handler for cubics"
```

---

## Task 4: Modificar OfficeRow.astro — Reemplazar botón por formulario POST

**Files:**
- Modify: `src/components/offices/OfficeRow.astro:200-208`

- [ ] **Step 1: Cambiar el botón de eliminar a un formulario con POST**

Encontrar este bloque en `OfficeRow.astro`:

```astro
        <button
          class="btn btn-xs btn-outline btn-error btn-delete-office"
          data-id={office.dbId}
          data-name={office.name}
          data-code={office.code}
          title="Eliminar"
        >
          <Icon name="boxicons:trash" class="size-3.5" />
        </button>
```

Reemplazar con:

```astro
        <form
          method="POST"
          action={`${import.meta.env.BASE_URL}oficinas/edit/${office.dbId}/eliminar`}
          class="inline"
          onsubmit="return confirm('¿Estás seguro de que deseas eliminar la oficina \`${office.name}\` (${office.code})?');"
        >
          <button
            type="submit"
            class="btn btn-xs btn-outline btn-error"
            title="Eliminar"
          >
            <Icon name="boxicons:trash" class="size-3.5" />
          </button>
        </form>
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/components/offices/OfficeRow.astro
git commit -m "refactor(offices): replace fetch DELETE with POST form in OfficeRow"
```

---

## Task 5: Modificar SupportGuideRow.astro — Reemplazar botón por formulario POST

**Files:**
- Modify: `src/components/support-guides/SupportGuideRow.astro:129-136`

- [ ] **Step 1: Cambiar el botón de eliminar a un formulario con POST**

Encontrar este bloque en `SupportGuideRow.astro`:

```astro
            <button
              class="btn btn-xs btn-outline btn-error btn-delete-support"
              data-id={guide.id}
              data-name={guide.helpDeskName}
              title="Eliminar"
            >
              <Icon name="boxicons:trash" class="size-3.5" />
            </button>
```

Reemplazar con:

```astro
            <form
              method="POST"
              action={`${import.meta.env.BASE_URL}soportes/edit/${guide.id}/eliminar`}
              class="inline"
              onsubmit="return confirm('¿Estás seguro de que deseas eliminar el soporte \"${guide.helpDeskName}\"?');"
            >
              <button
                type="submit"
                class="btn btn-xs btn-outline btn-error"
                title="Eliminar"
              >
                <Icon name="boxicons:trash" class="size-3.5" />
              </button>
            </form>
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/components/support-guides/SupportGuideRow.astro
git commit -m "refactor(soportes): replace fetch DELETE with POST form in SupportGuideRow"
```

---

## Task 6: Modificar InventarioContent.astro — Reemplazar botón de cubic y eliminar JS handler

**Files:**
- Modify: `src/components/inventario/InventarioContent.astro:640-647` (botón)
- Modify: `src/components/inventario/InventarioContent.astro:1028-1060` (JS handler)

- [ ] **Step 1: Cambiar el botón de eliminar cubic a formulario POST**

Encontrar este bloque en `InventarioContent.astro` (~line 640):

```astro
                    <button
                      class="btn btn-xs btn-outline btn-error btn-delete-cubic"
                      data-id={machine.id}
                      data-name={machine.name}
                      title="Eliminar"
                    >
                      <Icon name="boxicons:trash" class="size-3.5" />
                    </button>
```

Reemplazar con:

```astro
                    <form
                      method="POST"
                      action={`${import.meta.env.BASE_URL}inventario-terminales/cubics/edit/${machine.id}/eliminar`}
                      class="inline"
                      onsubmit="return confirm('¿Estás seguro de que deseas dar de baja el ordenador \"${machine.name}\"?');"
                    >
                      <button
                        type="submit"
                        class="btn btn-xs btn-outline btn-error"
                        title="Eliminar"
                      >
                        <Icon name="boxicons:trash" class="size-3.5" />
                      </button>
                    </form>
```

- [ ] **Step 2: Eliminar el JS handler de fetch DELETE para cubics**

Encontrar y eliminar este bloque completo en `InventarioContent.astro` (~lines 1028-1060):

```typescript
    const deleteBtn = target.closest(".btn-delete-cubic") as HTMLButtonElement | null;
    if (!deleteBtn) return;

    const id = deleteBtn.dataset.id;
    const name = deleteBtn.dataset.name;

    if (!id) return;

    if (!confirm(`¿Estás seguro de que deseas dar de baja el ordenador "${name}"?`)) {
      return;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/cubics/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        (window as any).showToast?.(data.message || "Ordenador dado de baja con éxito", "alert-success");
        const row = deleteBtn.closest("[data-machine-row]");
        row?.remove();
      } else {
        (window as any).showToast?.(data.error || "Error al dar de baja el ordenador", "alert-error");
      }
    } catch (err) {
      console.error(err);
      (window as any).showToast?.("Error de conexión al dar de baja el ordenador", "alert-error");
    }
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 4: Commit**

```bash
git add src/components/inventario/InventarioContent.astro
git commit -m "refactor(cubics): replace fetch DELETE with POST form in InventarioContent"
```

---

## Task 7: Modificar DirectorioContent.astro — Eliminar JS handler de fetch DELETE

**Files:**
- Modify: `src/components/offices/DirectorioContent.astro:710-749`

- [ ] **Step 1: Eliminar el JS handler de fetch DELETE para oficinas**

Encontrar y eliminar este bloque completo en `DirectorioContent.astro` (~lines 710-749):

```typescript
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest(".btn-delete-office") as HTMLButtonElement | null;
    if (!deleteBtn) return;

    const id = deleteBtn.dataset.id;
    const name = deleteBtn.dataset.name;
    const code = deleteBtn.dataset.code;

    if (!id) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar la oficina "${name}" (${code})?`)) {
      return;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/oficinas/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        (window as any).showToast?.(data.message || "Oficina eliminada con éxito", "alert-success");
        const row = deleteBtn.closest("[data-master-detail-sort-item]");
        row?.remove();
        
        const remainingRows = tableWrapper.querySelectorAll("[data-master-detail-sort-item]");
        if (remainingRows.length === 0) {
          document.getElementById("office-table-container")?.classList.add("hidden");
          document.getElementById("no-results-state")?.classList.remove("hidden");
        }
      } else {
        (window as any).showToast?.(data.error || "Error al eliminar la oficina", "alert-error");
      }
    } catch (err) {
      console.error(err);
      (window as any).showToast?.("Error de conexión al eliminar la oficina", "alert-error");
    }
```

**Nota:** Verificar que el código circundante siga siendo válido. Leer el bloque `addEventListener("click", ...)` completo y asegurarse de que no queden referencias rotas.

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/components/offices/DirectorioContent.astro
git commit -m "refactor(offices): remove fetch DELETE JS handler from DirectorioContent"
```

---

## Task 8: Modificar SoportesPublicContent.astro — Eliminar JS handler de fetch DELETE

**Files:**
- Modify: `src/components/soportes/SoportesPublicContent.astro:295-351`

- [ ] **Step 1: Eliminar el JS handler de fetch DELETE para soportes**

Encontrar y eliminar este bloque completo en `SoportesPublicContent.astro` (~lines 295-351):

```typescript
    const deleteBtn = target.closest(
      ".btn-delete-support",
    ) as HTMLButtonElement | null;
    if (!deleteBtn) return;

    const id = deleteBtn.dataset.id;
    const name = deleteBtn.dataset.name;

    if (!id) return;

    if (
      !confirm(`¿Estás seguro de que deseas eliminar el soporte "${name}"?`)
    ) {
      return;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/soportes/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        (window as any).showToast?.(
          data.message || "Soporte eliminado con éxito",
          "alert-success",
        );
        const row = deleteBtn.closest("[data-master-detail-sort-item]");
        row?.remove();

        const remainingRows = wrapper.querySelectorAll(
          "[data-master-detail-sort-item]",
        );
        if (remainingRows.length === 0) {
          document
            .getElementById("guides-table-container")
            ?.classList.add("hidden");
          document
            .getElementById("no-results-state")
            ?.classList.remove("hidden");
        }
      } else {
        (window as any).showToast?.(
          data.error || "Error al eliminar el soporte",
          "alert-error",
        );
      }
    } catch (err) {
      console.error(err);
      (window as any).showToast?.(
        "Error de conexión al eliminar el soporte",
        "alert-error",
      );
    }
```

**Nota:** Misma precaución que Task 7 — verificar que el listener contenedor no quede vacío.

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/components/soportes/SoportesPublicContent.astro
git commit -m "refactor(soportes): remove fetch DELETE JS handler from SoportesPublicContent"
```

---

## Task 9: Build final y verificación

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 2: Verificar que no quedan referencias a los handlers eliminados**

Run:
```bash
rg "btn-delete-office|btn-delete-cubic|btn-delete-support" src/components/ src/pages/
```
Expected: Solo resultados en OfficeRow, InventarioContent, SupportGuideRow — ahora como `<button type="submit">` dentro de `<form>`

Run:
```bash
rg "api/oficinas|api/soportes|api/cubics" src/components/ src/pages/
```
Expected: Sin resultados (o solo en los archivos API opcionales a eliminar)

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "refactor: migrate oficinas, soportes, cubics to POST+redirect delete pattern"
```

---

## Cleanup Opcional: Eliminar API endpoints obsoletos

**Files:**
- Delete: `src/pages/api/oficinas/[id].ts`
- Delete: `src/pages/api/soportes/[id].ts`
- Delete: `src/pages/api/cubics/[id].ts`

Estos endpoints solo contenían el handler `DELETE` y ya no son necesarios.

- [ ] **Step 1: Verificar que no hay otras referencias a estos endpoints**

```bash
rg "api/oficinas\[" src/ --include="*.astro" --include="*.ts" --include="*.tsx"
rg "api/soportes\[" src/ --include="*.astro" --include="*.ts" --include="*.tsx"
rg "api/cubics\[" src/ --include="*.astro" --include="*.ts" --include="*.tsx"
```
Expected: Sin resultados

- [ ] **Step 2: Eliminar los archivos**

```bash
Remove-Item -LiteralPath "src/pages/api/oficinas/[id].ts" -Force
Remove-Item -LiteralPath "src/pages/api/soportes/[id].ts" -Force
Remove-Item -LiteralPath "src/pages/api/cubics/[id].ts" -Force
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: Build exit code 0

- [ ] **Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove unused API DELETE endpoints (oficinas, soportes, cubics)"
```
