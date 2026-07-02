# C1.1 — Consolidar `base` / `cleanBase` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar las ~80 declaraciones duplicadas del snippet `const base = import.meta.env.BASE_URL || "/"; const cleanBase = ...;` repartidas en 46 archivos, centralizándolas en `src/lib/baseUrl.ts`.

**Architecture:** Nuevo helper módulo-level con una constante `RAW_BASE` (reemplazada en build-time por Vite) y dos funciones exportadas (`getCleanBase` con `/` final, `getBaseNoSlash` sin `/` final). Cada archivo se refactoriza para importar el helper; los `<script>` blocks de Astro usan imports ESM estándar (ya soportado en 14+ archivos del proyecto). `url.ts` se refactoriza internamente para llamar al nuevo helper, dejando una única fuente de verdad.

**Tech Stack:** Astro SSR 5 (DaisyUI 5, Tailwind 4, React islands) + better-sqlite3 + Drizzle. TypeScript estricto. Path alias `@lib/*` ya configurado. Sin tests automatizados para este patrón (verificado: 0 matches en `tests/`), verificación = `npm run build` + smoke test manual en dev server.

---

## Contexto & diagnóstico

**Audit:** `docs/superpowers/specs/2026-07-02-auditoria-componentizacion.md` (P0 — DRY utilities, item C1.1).

**Inventario verificado:**

| Categoría | Archivos | Declaraciones | Patrón |
|---|---|---|---|
| `.astro` frontmatter | 30 | 30× (1 c/u) | A (con `/` final) |
| `.astro` `<script>` blocks (bundled) | 3 + 1 | 10× (3 c/u + 1) | A |
| `.ts` (middleware, navigation, logout) | 3 | 3× | A |
| `.ts` `eliminar.ts` | 10 | ~37× (3-4 c/u) | B (sin `/` final) |
| Anomalías | 2 | 2× | mixta |
| **Total** | **46** | **~82** | |

**Anomalías a corregir en el refactor:**
- `src/components/supervision/asistencia/EstadisticasContent.astro:493` — la variable local se llama `cleanBase` pero contiene el valor crudo; el valor "real cleanBase" se asigna a `finalBase`. Es un **bug latente** de naming que se corrige como side-effect del refactor.
- `src/components/buscador-usuarios/BuscadorUsuariosContent.astro:12` — usa `(import.meta.env as any).BASE_URL` (cast `as any` evitado por algún motivo, se elimina con el refactor).
- `src/pages/admin/aplicativos/edit/[id]/eliminar.ts:28` y `categorias/edit/[id]/eliminar.ts:58` — **mezclan** las dos variantes en el mismo archivo.

**Out of scope** (queda como C1.1.b en ticket separado): Pattern C — `const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "")` en 8 archivos (SoportesPublic, Inventario, Directorio, OfficeForm, AdminOffices, Asistencia, Estadisticas, profile). Usa `BASE_URL` directamente sin `cleanBase`.

**Inline `<script is:inline>`:** verificado que ninguno usa `cleanBase` (todos son blocks de toast/notif que usan `window.showToast`). No requieren migración.

---

## Estructura de archivos

**Crear:**
- `src/lib/baseUrl.ts` — helper con `getCleanBase()` y `getBaseNoSlash()`.

**Modificar (47 archivos total):**
- `src/lib/url.ts` — usar `getCleanBase()` internamente.
- `src/middleware.ts`, `src/lib/navigation.ts`, `src/pages/logout.ts` — `.ts` no-`eliminar`.
- 30× `.astro` frontmatter (1 declaración c/u).
- 3× `.astro` `<script>` con multi-declaraciones (AdminContactos, AdminRecursos, AdminAplicativos Content).
- 1× `.astro` `<script>` standalone (DeleteCategoryModal).
- 10× `eliminar.ts` (Pattern B + anomalías mixtas).
- 2× anomalías (EstadisticasContent inverted-name, BuscadorUsuarios `as any`).

**Documentación:**
- `AGENTS.md` — agregar nota breve en sección "Stack & style".

---

## Task 0: Crear helper `src/lib/baseUrl.ts`

**Files:**
- Create: `src/lib/baseUrl.ts`

- [ ] **Step 1: Crear `src/lib/baseUrl.ts` con la implementación del helper**

Contenido exacto (12 líneas):

```ts
const RAW_BASE = import.meta.env.BASE_URL || "/";

export function getCleanBase(): string {
  return RAW_BASE.endsWith("/") ? RAW_BASE : RAW_BASE + "/";
}

export function getBaseNoSlash(): string {
  return RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;
}
```

Notas:
- `RAW_BASE` es módulo-level: Vite la reemplaza en build-time (`import.meta.env.BASE_URL` → `"/"`). Sin coste runtime.
- `getCleanBase()` retorna siempre con `/` final. Uso: `` `${getCleanBase()}api/foo` `` (path sin leading slash).
- `getBaseNoSlash()` retorna siempre sin `/` final. Uso: `` `${getBaseNoSlash()}/oficinas` `` (path con leading slash). Para BASE_URL=`/`, retorna `""`.

- [ ] **Step 2: Verificar que compila con `npm run build`**

Run: `npm run build`
Expected: build OK, sin errores. Sin warnings nuevos de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/lib/baseUrl.ts
git commit -m "feat(lib): add getCleanBase / getBaseNoSlash helper"
```

---

## Task 1: Refactorizar `src/lib/url.ts` para usar el helper

**Files:**
- Modify: `src/lib/url.ts`

- [ ] **Step 1: Reemplazar el cuerpo de `resolveUrl` para usar `getCleanBase`**

Reemplazar todo el contenido de `src/lib/url.ts` (6 líneas actuales) por:

```ts
import { getCleanBase } from "./baseUrl";

export function resolveUrl(path: string, base?: string): string {
  if (base !== undefined) {
    const b = base.endsWith("/") ? base : base + "/";
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${b}${cleanPath}`;
  }
  return `${getCleanBase()}${path.startsWith("/") ? path.slice(1) : path}`;
}
```

Notas:
- Mantiene la API pública: `resolveUrl(path, base?)`. Si el caller pasa `base` (caso edge en tests), respeta ese valor sin consultar `import.meta.env`.
- Elimina la duplicación interna del literal `cleanBase`.

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: OK. `resolveUrl` mantiene su firma → los 100+ callsites no se tocan.

- [ ] **Step 3: Commit**

```bash
git add src/lib/url.ts
git commit -m "refactor(lib): url.ts resolveUrl uses getCleanBase helper"
```

---

## Task 2: Refactorizar `.ts` no-`eliminar` (3 archivos)

**Files:**
- Modify: `src/middleware.ts:14-15`
- Modify: `src/lib/navigation.ts:164-165`
- Modify: `src/pages/logout.ts:18-19`

- [ ] **Step 1: Refactorizar `src/middleware.ts`**

Eliminar líneas 14-15:
```ts
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith('/') ? base : base + '/';
```

Agregar (justo después de los imports existentes, línea 9):
```ts
import { getCleanBase } from "./lib/baseUrl";
```

Reemplazar la línea 15 por (consumida en `getRelativePath`):
```ts
  const cleanBase = getCleanBase();
```

Resultado: `getRelativePath` (líneas 17-25) sigue funcionando idéntico.

- [ ] **Step 2: Refactorizar `src/lib/navigation.ts`**

Eliminar líneas 164-165 (dentro de `getSectionTitle`):
```ts
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base : base + "/";
```

Reemplazar por una sola línea:
```ts
    const cleanBase = getCleanBase();
```

Confirmar que `getCleanBase` está importado (si no lo está, agregar al bloque de imports del archivo):
```ts
import { getCleanBase } from "./baseUrl";
```

- [ ] **Step 3: Refactorizar `src/pages/logout.ts`**

Eliminar líneas 18-19:
```ts
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : base + "/";
```

Reemplazar por:
```ts
  const cleanBase = getCleanBase();
```

Confirmar import: `import { getCleanBase } from "@lib/baseUrl";` al inicio del archivo.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/lib/navigation.ts src/pages/logout.ts
git commit -m "refactor: replace duplicated cleanBase in .ts modules with helper"
```

---

## Task 3: Refactorizar frontmatter `.astro` simples (30 archivos)

**Patrón universal** para cada archivo:

Antes (líneas X-Y del frontmatter):
```ts
const base = import.meta.env.BASE_URL || "/";
const cleanBase = base.endsWith("/") ? base : base + "/";
```

Después (en el bloque `---`):
```ts
import { getCleanBase } from "@lib/baseUrl";
...
const cleanBase = getCleanBase();
```

**Archivos a tocar** (path, líneas):

1. `src/layouts/BaseLayout.astro:54-55`
2. `src/pages/login/index.astro:20-21`
3. `src/pages/admin/index.astro:20-21`
4. `src/pages/soportes/create.astro:12-13`
5. `src/pages/soportes/edit/[id].astro:12-13`
6. `src/pages/oficinas/create.astro:21-22`
7. `src/pages/oficinas/edit/[id].astro:21-22`
8. `src/pages/inventario-terminales/cubics/create.astro:18-19`
9. `src/pages/inventario-terminales/cubics/edit/[id].astro:18-19`
10. `src/pages/supervision/index.astro:2-3`
11. `src/pages/supervision/cronograma/index.astro:8-9`
12. `src/pages/supervision/asistencia/estadisticas.astro:9-10`
13. `src/pages/recursos/_components/LinkItem.astro:44-45`
14. `src/pages/recursos/aplicativos/_components/CatalogAppCard.astro:48-49`
15. `src/pages/recursos/aplicativos/_components/CatalogBundleBanner.astro:13-14`
16. `src/components/ui/AnnouncementBanner.astro:80-81` (usa single quotes: `'/`, preservar comillas o normalizar — preferir doble)
17. `src/components/ui/QuickAccessCard.astro:26-27`
18. `src/components/admin/AdminOfficeRow.astro:23-24`
19. `src/components/admin/operadores/AdminOperadoresContent.astro:12-13`
20. `src/components/admin/aplicativos/AdminAplicativosContent.astro:17-18` (frontmatter; las 3 declaraciones dentro del `<script>` se refactorizan en Task 4)
21. `src/components/admin/contacts/AdminContactsContent.astro:16-17` (idem)
22. `src/components/admin/cubics/AdminCubicsContent.astro:79-80` (single quotes — normalizar)
23. `src/components/admin/offices/AdminOfficesContent.astro:183-184` (NO tocar línea 445 con `baseUrl` Pattern C — out of scope)
24. `src/components/admin/recursos/AdminRecursosContent.astro:16-17` (frontmatter; script en Task 4)
25. `src/components/admin/soportes/AdminSoportesContent.astro:13-14`
26. `src/components/supervision/asistencia/AsistenciaContent.astro:5-6`
27. `src/components/supervision/calidad/CalidadContent.astro:291-292`
28. `src/components/supervision/asignacion/AsignacionContent.astro:22-23`
29. `src/components/enlaces/EnlacesContent.astro:54-55`
30. `src/components/buscador-usuarios/BuscadorUsuariosContent.astro:12-13` (aquí también se elimina el `(import.meta.env as any)` → `import { getCleanBase }`)

- [ ] **Step 1: Para cada archivo de la lista**

   a. Abrir el archivo, ubicar las 2 líneas en el frontmatter.
   b. Verificar que ya existe (o agregar) un import de `@lib/baseUrl` en el bloque de imports superior.
   c. Eliminar las 2 líneas (`const base = ...; const cleanBase = ...;`).
   d. Insertar `const cleanBase = getCleanBase();` en el mismo punto.
   e. Verificar indentación: usualmente 0 espacios (top-level) o 2 (dentro de funciones/objetos).

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: OK. Si falla, normalmente por un import no agregado.

- [ ] **Step 3: Smoke test rápido en dev server**

Run: `npm run dev` (en otra terminal o background)

Visitar manualmente:
- `http://localhost:4321/` (home)
- `http://localhost:4321/oficinas` (lista de oficinas)
- `http://localhost:4321/admin/contactos` (CRUD refactorizado)

Expected: las páginas renderizan. Los assets (`favicon`, `manifest`, `apple-touch-icon`) cargan. Las redirecciones (`Astro.redirect(cleanBase)`) funcionan.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/BaseLayout.astro src/pages/login/index.astro src/pages/admin/index.astro \
        src/pages/soportes/create.astro src/pages/soportes/edit/\[id\].astro \
        src/pages/oficinas/create.astro src/pages/oficinas/edit/\[id\].astro \
        src/pages/inventario-terminales/cubics/create.astro \
        src/pages/inventario-terminales/cubics/edit/\[id\].astro \
        src/pages/supervision/index.astro src/pages/supervision/cronograma/index.astro \
        src/pages/supervision/asistencia/estadisticas.astro \
        src/pages/recursos/_components/LinkItem.astro \
        src/pages/recursos/aplicativos/_components/CatalogAppCard.astro \
        src/pages/recursos/aplicativos/_components/CatalogBundleBanner.astro \
        src/components/ui/AnnouncementBanner.astro \
        src/components/ui/QuickAccessCard.astro \
        src/components/admin/AdminOfficeRow.astro \
        src/components/admin/operadores/AdminOperadoresContent.astro \
        src/components/admin/aplicativos/AdminAplicativosContent.astro \
        src/components/admin/contacts/AdminContactsContent.astro \
        src/components/admin/cubics/AdminCubicsContent.astro \
        src/components/admin/offices/AdminOfficesContent.astro \
        src/components/admin/recursos/AdminRecursosContent.astro \
        src/components/admin/soportes/AdminSoportesContent.astro \
        src/components/supervision/asistencia/AsistenciaContent.astro \
        src/components/supervision/calidad/CalidadContent.astro \
        src/components/supervision/asignacion/AsignacionContent.astro \
        src/components/enlaces/EnlacesContent.astro \
        src/components/buscador-usuarios/BuscadorUsuariosContent.astro

git commit -m "refactor: replace cleanBase in .astro frontmatter with helper"
```

---

## Task 4: Refactorizar `<script>` blocks con multi-declaraciones (3 archivos)

**Patrón:** estos archivos tienen 1 declaración en el frontmatter (refactorizada en Task 3) y **3 declaraciones adicionales** dentro del `<script>` block a 6-space indent. Reemplazar las 3 internas por **1 sola** al inicio del `<script>`.

### 4a. `src/components/admin/contacts/AdminContactsContent.astro`

- [ ] **Step 1: Localizar las 3 declaraciones internas**

Líneas 405-406, 636-637, 736-737, todas a 6-space indent. Ejemplo (línea 405):
```ts
      const base = import.meta.env.BASE_URL || "/";
      const cleanBase = base.endsWith("/") ? base : base + "/";
```

- [ ] **Step 2: Agregar import y declaración top-level al inicio del `<script>`**

Insertar al inicio del `<script>` (línea 336-337) después del primer import existente:
```ts
<script>
  import { getCleanBase } from "@lib/baseUrl";
  const cleanBase = getCleanBase();
  ...
```

- [ ] **Step 3: Eliminar las 3 declaraciones internas (líneas 405-406, 636-637, 736-737)**

Borrar las 6 líneas (3 pares). Las referencias a `cleanBase` más abajo siguen funcionando porque ahora apuntan a la top-level.

### 4b. `src/components/admin/recursos/AdminRecursosContent.astro`

- [ ] **Step 4: Mismo procedimiento**

Líneas 422-423, 653-654, 753-754, todas a 6-space indent. Reemplazar por import top-level + 1 declaración al inicio del `<script>`.

### 4c. `src/components/admin/aplicativos/AdminAplicativosContent.astro`

- [ ] **Step 5: Mismo procedimiento**

Líneas 441-442, 653-654, 748-749, todas a 6-space indent. Reemplazar por import top-level + 1 declaración al inicio del `<script>`.

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 7: Smoke test del CRUD admin**

En `http://localhost:4321/admin/contactos`, `/admin/recursos`, `/admin/aplicativos`:
- Verificar que el botón "Agregar contacto/recurso/aplicativo" construye el href correctamente (debe apuntar a `/admin/contactos/create`, no a `admin/contactos/create` sin slash).
- Probar el reorder drag-drop: la URL del fetch debe ser `${cleanBase}api/...`.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/contacts/AdminContactsContent.astro \
        src/components/admin/recursos/AdminRecursosContent.astro \
        src/components/admin/aplicativos/AdminAplicativosContent.astro

git commit -m "refactor(admin): dedupe cleanBase in admin CRUD <script> blocks"
```

---

## Task 5: Refactorizar `DeleteCategoryModal.astro` `<script>`

**Files:**
- Modify: `src/components/ui/DeleteCategoryModal.astro:68-69`

- [ ] **Step 1: Localizar declaración dentro del `<script>`**

Líneas 63-75 contienen el `<script>` block. Líneas 68-69:
```ts
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : base + "/";
```

- [ ] **Step 2: Agregar import al inicio del `<script>` (línea 63) y reemplazar**

```ts
<script>
  import { getCleanBase } from "@lib/baseUrl";
  const cleanBase = getCleanBase();
  ...
```

Eliminar las 2 líneas 68-69.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/DeleteCategoryModal.astro
git commit -m "refactor(ui): dedupe cleanBase in DeleteCategoryModal"
```

---

## Task 6: Refactorizar los 10 `eliminar.ts` (Pattern B)

**Patrón universal** (cada archivo tiene 3-4 declaraciones a 4-space, 6-space u 8-space indent dentro de try/catch/if):

Antes:
```ts
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
```

Después (usar `getBaseNoSlash`):
```ts
    const cleanBase = getBaseNoSlash();
```

Y agregar import (justo después de los imports existentes, top-level):
```ts
import { getBaseNoSlash } from "@lib/baseUrl";
```

**Archivos** (path, líneas de las declaraciones):

1. `src/pages/oficinas/edit/[id]/eliminar.ts` — 11, 18, 36, 46 (4×)
2. `src/pages/soportes/edit/[id]/eliminar.ts` — 11, 18, 36, 46 (4×)
3. `src/pages/inventario-terminales/cubics/edit/[id]/eliminar.ts` — 11, 18, 38, 48 (4×)
4. `src/pages/admin/contactos/edit/[id]/eliminar.ts` — 10, 28, 32, 38 (4×)
5. `src/pages/admin/operadores/edit/[id]/eliminar.ts` — 10, 26, 31 (3×)
6. `src/pages/admin/recursos/enlace/edit/[id]/eliminar.ts` — 10, 17, 32, 37 (4×)
7. `src/pages/admin/recursos/categoria/edit/[id]/eliminar.ts` — 22, 66, 71 (3×)
8. `src/pages/admin/contactos/categoria/edit/[id]/eliminar.ts` — 22, 55, 60 (3×)
9. `src/pages/admin/aplicativos/edit/[id]/eliminar.ts` — **MIXED**: 3× no-slash (11, 48, 53) + 1× `cleanBaseUrl` con slash (27-28). Refactor 11/48/53 con `getBaseNoSlash`. Para línea 27-28, refactorizar a `getCleanBase`.
10. `src/pages/admin/aplicativos/categorias/edit/[id]/eliminar.ts` — **MIXED**: 3× no-slash (23, 86, 91) + 1× con slash (57-58). Idem.

- [ ] **Step 1: Para cada archivo de la lista**

   a. Abrir y agregar `import { getBaseNoSlash } from "@lib/baseUrl";` (y `getCleanBase` si tiene la anomalía mixta) al bloque de imports.
   b. Para cada par de líneas listado, eliminar el `const base = ...` y reemplazar el `const cleanBase = ...` por `const cleanBase = getBaseNoSlash();`.
   c. Verificar indentación: las declaraciones están a distintos niveles de nesting (4, 6, 8 spaces). Reemplazo es idéntico: 2 líneas → 1 línea, misma indentación.

- [ ] **Step 2: Caso especial — `aplicativos/edit/[id]/eliminar.ts` línea 27-28**

Reemplazar:
```ts
        const base = import.meta.env.BASE_URL || "/";
        const cleanBaseUrl = base.endsWith("/") ? base : base + "/";
        const downloadPrefix = `${cleanBaseUrl}api/download/`;
```

Por (mantener `cleanBaseUrl` como nombre local porque el resto del código lo usa):
```ts
        const cleanBaseUrl = getCleanBase();
        const downloadPrefix = `${cleanBaseUrl}api/download/`;
```

- [ ] **Step 3: Caso especial — `aplicativos/categorias/edit/[id]/eliminar.ts` línea 57-58**

Mismo procedimiento que Step 2.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 5: Smoke test de eliminaciones**

Con dev server corriendo, probar en un entorno seguro (no prod):
- `POST /oficinas/edit/1/eliminar` (con sesión admin) → debe redirigir a `/oficinas?toast_msg=...&toast_type=...`.
- `POST /admin/contactos/edit/1/eliminar` → idem.

Verificar que la URL de redirección es la correcta (no incluye doble slash, no falta el path).

- [ ] **Step 6: Commit**

```bash
git add src/pages/oficinas/edit/\[id\]/eliminar.ts \
        src/pages/soportes/edit/\[id\]/eliminar.ts \
        src/pages/inventario-terminales/cubics/edit/\[id\]/eliminar.ts \
        src/pages/admin/contactos/edit/\[id\]/eliminar.ts \
        src/pages/admin/operadores/edit/\[id\]/eliminar.ts \
        src/pages/admin/recursos/enlace/edit/\[id\]/eliminar.ts \
        src/pages/admin/recursos/categoria/edit/\[id\]/eliminar.ts \
        src/pages/admin/contactos/categoria/edit/\[id\]/eliminar.ts \
        src/pages/admin/aplicativos/edit/\[id\]/eliminar.ts \
        src/pages/admin/aplicativos/categorias/edit/\[id\]/eliminar.ts

git commit -m "refactor(api): dedupe cleanBase in 10 eliminar.ts endpoints"
```

---

## Task 7: Corregir anomalías (2 archivos)

**Files:**
- Modify: `src/components/supervision/asistencia/EstadisticasContent.astro:493-494` (inverted-name bug)
- Modify: `src/components/buscador-usuarios/BuscadorUsuariosContent.astro:12-13` (ya cubierto en Task 3 — verificar)

- [ ] **Step 1: Fix bug inverted-name en `EstadisticasContent.astro`**

Localizar líneas 493-494 dentro del `<script>` (10-space indent):
```ts
          const cleanBase = import.meta.env.BASE_URL || "/";
          const finalBase = cleanBase.endsWith("/") ? cleanBase : cleanBase + "/";
          window.location.href = `${finalBase}supervision/asistencia?date=${log.date}`;
```

Verificar que ya existe un import de `getCleanBase` (lo agregamos en Task 3 si era necesario para el frontmatter, sino agregar al script):
```ts
import { getCleanBase } from "@lib/baseUrl";
```

Reemplazar las 3 líneas (493-495) por:
```ts
          window.location.href = `${getCleanBase()}supervision/asistencia?date=${log.date}`;
```

Esto elimina el bug latente: ahora `getCleanBase()` retorna el valor correcto en una sola llamada.

- [ ] **Step 2: Verificar `BuscadorUsuariosContent.astro`**

Este archivo fue cubierto en Task 3 (frontmatter línea 12-13). El `(import.meta.env as any).BASE_URL` se eliminó al refactorizar el frontmatter. No requiere acción adicional.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Smoke test**

Visitar `http://localhost:4321/supervision/asistencia/estadisticas`. Click en una celda del grid de asistencia → debe redirigir a `/supervision/asistencia?date=YYYY-MM-DD` correctamente.

- [ ] **Step 5: Commit**

```bash
git add src/components/supervision/asistencia/EstadisticasContent.astro
git commit -m "fix(asistencia): correct inverted cleanBase naming in EstadisticasContent"
```

---

## Task 8: Actualizar `AGENTS.md`

**Files:**
- Modify: `AGENTS.md` (sección "Stack & style")

- [ ] **Step 1: Agregar línea en la sección "Stack & style"**

Después de la línea sobre `astro-icon`, agregar:

```markdown
- **URL base helper**: `@lib/baseUrl` expone `getCleanBase()` (con `/` final, para `` `${...}api/foo` ``) y `getBaseNoSlash()` (sin `/` final, para `` `${...}/oficinas` ``). Usar siempre; nunca re-declarar `const base = import.meta.env.BASE_URL || "/"` inline.
```

- [ ] **Step 2: Verificar que el cambio se ve correcto**

Run: `Get-Content "AGENTS.md" | Select-String -Pattern "baseUrl" -Context 2,2`
Expected: la nueva línea aparece, contexto coherente con el resto de la sección.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document @lib/baseUrl helper"
```

---

## Verificación final

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: OK, 0 errores, 0 warnings nuevos.

- [ ] **Step 2: Verificar que no quedan residuos del patrón antiguo**

Run: `rg "const base = import\.meta\.env\.BASE_URL" src/`
Expected: 0 matches (excepto posiblemente dentro de `src/lib/baseUrl.ts` si se usa la forma inline, que NO es el caso — usamos `const RAW_BASE`).

Run: `rg "const cleanBase = " src/`
Expected: solo matches en el frontmatter de archivos refactorizados que conservan `const cleanBase = getCleanBase()` (declaraciones válidas, ~40 ocurrencias esperadas, no 80+).

Run: `rg "base\.endsWith\(['\"]\\/['\"]\)" src/`
Expected: 0 matches (el helper internaliza esa lógica).

- [ ] **Step 3: Smoke test integral**

Con `npm run dev` activo, recorrer:
- `/` (home — verifica `BaseLayout.astro` con assets/favicon)
- `/oficinas`, `/oficinas/create`, `/oficinas/edit/1` (verifica flujo CRUD completo)
- `/soportes`, `/soportes/create`
- `/admin/contactos`, `/admin/contactos/create` (CRUD + modal delete)
- `/admin/aplicativos`, `/admin/aplicativos/create` (CRUD + upload de archivo)
- `/supervision/asistencia/estadisticas` (verifica fix de `EstadisticasContent`)

Verificar en DevTools (F12 → Network) que las requests a assets y APIs no tienen doble slash ni faltan paths.

- [ ] **Step 4: Cierre**

Resumen de impacto:
- **~82 declaraciones eliminadas** (de 80+ duplicados a 0, solo quedan ~40 referencias al helper).
- **1 archivo nuevo** (`src/lib/baseUrl.ts`, 12 líneas).
- **47 archivos modificados** (1 lib + 3 .ts + 30 .astro + 3 .astro scripts + 1 .astro modal + 10 eliminar.ts = 48; los 2 anomalías están en la lista de .astro frontmatter).
- **~200 líneas eliminadas netas.**
- **2 bugs latentes corregidos** (inverted-name en EstadisticasContent, `as any` cast en BuscadorUsuarios).

---

## Notas finales

- **No se agregaron tests automatizados** porque el patrón original no tenía cobertura. La verificación es por build + smoke test. Si en el futuro se quiere cobertura, agregar tests unitarios de `baseUrl.ts` que mockeen `import.meta.env.BASE_URL`.
- **No se tocó `url.ts` externamente**: sigue exportando `resolveUrl(path, base?)` con la misma API. 100+ callsites no se afectan.
- **No se tocó el Pattern C** (8 archivos con `const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "")`). Queda como **C1.1.b** en un ticket separado.
- **No se tocaron scripts `is:inline`**: verificado que ninguno usa `cleanBase`.
- **Próximos pasos del audit** (no en este plan): C1.2 (escapeHtml), C3.1 (11 modales raw), C2.1-2.4 (StatsCard, FilterButtonBar, etc.). Cada uno requiere su propio plan.
