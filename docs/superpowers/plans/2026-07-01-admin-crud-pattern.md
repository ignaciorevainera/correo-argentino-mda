# Unificación Admin CRUD Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estandarizar la interfaz y el comportamiento de las páginas de creación y edición (CRUD) de la sección Admin para que coincidan con los patrones definidos en `admin-crud-pattern`.

**Architecture:** Se actualizarán los formularios de las entidades (aplicativos, contactos, operadores, recursos) para que todos utilicen `resolveUrl()`, breadcrumbs consistentes con `PageHeader`, el script robusto de `triggerToast` para manejo de errores, y tengan `<AsyncFormScript />` ubicado correctamente dentro de `<BaseLayout>`.

**Tech Stack:** Astro, Tailwind, TypeScript.

---

### Task 1: Unificar Aplicativos y Categorías

**Files:**
- Modify: `src/pages/admin/aplicativos/create.astro`
- Modify: `src/pages/admin/aplicativos/edit/[id].astro`
- Modify: `src/pages/admin/aplicativos/categorias/create.astro`
- Modify: `src/pages/admin/aplicativos/categorias/edit/[id].astro`

- [ ] **Step 1: Unificar `resolveUrl()` y `AsyncFormScript` en aplicativos**

En `src/pages/admin/aplicativos/create.astro` y `src/pages/admin/aplicativos/edit/[id].astro`:
1. Asegurarse de usar `import { resolveUrl } from "@lib/url";`. Eliminar `cleanBase`. Reemplazar cualquier uso de `cleanBase` con llamadas a `resolveUrl()`.
2. Mover `<AsyncFormScript />` para que esté dentro del slot de `<BaseLayout>`, es decir, moverlo justo antes de `</BaseLayout>`.
3. Actualizar el script de errorMsg (si existe) para usar el patrón robusto con `triggerToast` y `setTimeout`:
```html
          {
            errorMsg && (
              <script is:inline define:vars={{ errorMsg }}>
                const triggerToast = () => {
                  if (window.showToast) {
                    window.showToast(errorMsg, "alert-error");
                  } else {
                    setTimeout(triggerToast, 100);
                  }
                };
                if (document.readyState === "loading") {
                  document.addEventListener("DOMContentLoaded", triggerToast);
                } else {
                  triggerToast();
                }
              </script>
            )
          }
```
4. Reemplazar la cabecera manual del formulario con botón "X" por los breadcrumbs y `PageHeader` (ver ejemplo de `contactos/create.astro`). Eliminar el `<div class="flex items-start justify-between mb-6 ...">` y el `<a>` con la "X", y colocar arriba del `SectionCard` el div con los breadcrumbs (envolviendo el link de "volver") y `<PageHeader>`.

- [ ] **Step 2: Unificar `resolveUrl()` y `AsyncFormScript` en categorías de aplicativos**

En `src/pages/admin/aplicativos/categorias/create.astro` y `src/pages/admin/aplicativos/categorias/edit/[id].astro`:
1. Mover `<AsyncFormScript />` adentro del `<BaseLayout>`.
2. Reemplazar el layout de la cabecera (que incluye el botón "X" de cerrado rápido) por los breadcrumbs y el `PageHeader` correspondientes. El código de errorMsg ya utiliza el patrón robusto, por lo que se mantiene.
3. Asegurarse de usar `resolveUrl` y no `cleanBase`. (Este archivo ya usa `resolveUrl` en su mayoría, pero verificar inconsistencias).

### Task 2: Unificar Contactos y Categorías

**Files:**
- Modify: `src/pages/admin/contactos/create.astro`
- Modify: `src/pages/admin/contactos/edit/[id].astro`
- Modify: `src/pages/admin/contactos/categoria/create.astro`
- Modify: `src/pages/admin/contactos/categoria/edit/[id].astro`

- [ ] **Step 1: Aplicar correcciones a `contactos`**

En `src/pages/admin/contactos/create.astro` y `src/pages/admin/contactos/edit/[id].astro`:
1. Reemplazar la constante `cleanBase` por la importación y uso de `resolveUrl()`.
2. Modificar el bloque de error:
```html
    {
      errorMsg && (
        <script is:inline define:vars={{ errorMsg }}>
          const triggerToast = () => {
            if (window.showToast) {
              window.showToast(errorMsg, "alert-error");
            } else {
              setTimeout(triggerToast, 100);
            }
          };
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", triggerToast);
          } else {
            triggerToast();
          }
        </script>
      )
    }
```
3. Verificar que `<AsyncFormScript />` esté ubicado correctamente antes del `</BaseLayout>`. (Ya debería estarlo, pero confirmarlo).

- [ ] **Step 2: Aplicar correcciones a categorías de `contactos`**

En `src/pages/admin/contactos/categoria/create.astro` y `src/pages/admin/contactos/categoria/edit/[id].astro`:
1. Reemplazar la constante `cleanBase` por `resolveUrl()`.
2. Verificar que `<AsyncFormScript />` esté antes de `</BaseLayout>`.

### Task 3: Unificar Operadores

**Files:**
- Modify: `src/pages/admin/operadores/create.astro`
- Modify: `src/pages/admin/operadores/edit/[id].astro`

- [ ] **Step 1: Correcciones de base en `operadores`**

En `src/pages/admin/operadores/create.astro` y `src/pages/admin/operadores/edit/[id].astro`:
1. Eliminar `cleanBase` y reemplazar con `resolveUrl()`.
2. Actualizar la inyección de `errorMsg` usando el patrón unificado de `triggerToast` detallado previamente.
3. Asegurar que `<AsyncFormScript />` quede justo arriba de `</BaseLayout>`.

### Task 4: Unificar Recursos

**Files:**
- Modify: `src/pages/admin/recursos/categoria/create.astro`
- Modify: `src/pages/admin/recursos/categoria/edit/[id].astro`
- Modify: `src/pages/admin/recursos/enlace/create.astro`
- Modify: `src/pages/admin/recursos/enlace/edit/[id].astro`

- [ ] **Step 1: Correcciones en subentidades de recursos**

Para los 4 archivos de recursos (`categoria/create`, `categoria/edit`, `enlace/create`, `enlace/edit`):
1. Eliminar `cleanBase` y reemplazar con uso estándar de `resolveUrl()`.
2. Actualizar script de validación de `errorMsg` si no emplea el patrón con `setTimeout` explícito de `triggerToast`.
3. Validar ubicación de `<AsyncFormScript />` dentro de `<BaseLayout>`.

---

## Verificación
Se verificará manualmente corriendo `npm run build` o `npx astro check` para asegurarse que no introdujimos errores de tipado o de sintaxis HTML.
Se visualizará en entorno de desarrollo (`npm run dev`) un formulario (ej. Contactos > Nuevo) para verificar que el breadcrumb existe, el script de async funciona, y los errores por validaciones incorrectas se muestran con el Toast correspondiente.
