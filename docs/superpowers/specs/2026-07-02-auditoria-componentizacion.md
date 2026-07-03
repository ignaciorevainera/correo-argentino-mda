# Auditoría — Componentización

**Fecha:** 2026-07-02 (8.ª pasada)
**Enfoque:** DRY, componentes reutilizables, consolidación de patrones
**Base:** Escaneo integral del proyecto

---

## Resumen

| Prioridad | Cantidad |
|-----------|----------|
| 🔴 P0 — DRY utilities | 1 pendiente (C1.2) |
| 🔴 P1 — Componentes UI reutilizables | 5 |
| 🟡 P2 — Consolidación patrones admin | 7 |
| 🟢 P3 — Scripts inline a módulos | 2 |

---

## P0 — DRY utilities (mayor impacto)

### C1.1 ✅ `base`/`cleanBase` copiado 80+ veces en 40+ archivos — **RESUELTO**

El snippet de dos líneas está copiado en TODAS las páginas, componentes y
scripts del lado del cliente:

```ts
const base = import.meta.env.BASE_URL || "/";
const cleanBase = base.endsWith("/") ? base : base + "/";
```

Afecta layouts, páginas, componentes, y los 10 archivos `eliminar.ts` (donde
se duplica 3-4 veces CADA UNO).

**Archivos más afectados:**
- `AdminContactsContent.astro` (4 copias en diferentes scopes)
- `AdminRecursosContent.astro` (4 copias)
- `AdminAplicativosContent.astro` (4 copias)
- 10 archivos `eliminar.ts` (3-4 copias c/u)
- 22+ páginas admin CRUD
- Numerosos componentes (QuickAccessCard, AnnouncementBanner, etc.)

**Fix aplicado:** Se creó `src/lib/baseUrl.ts` con `getCleanBase()` y `getBaseNoSlash()`.
Se eliminaron ~82 declaraciones duplicadas en 47 archivos (frontmatter, scripts,
endpoints `eliminar.ts`), refactorizado `src/lib/url.ts` internamente, corregido
bug latente de naming invertido en `EstadisticasContent.astro`, y actualizado
`AGENTS.md`.

**Merge:** Commit `01a3d91` en `master` (fast-forward).
**Esfuerzo real:** ~2 h. **Impacto real:** -200+ líneas, eliminación de ~82 duplicados.
**Branch de trabajo:** `fix/c11-base-cleanbase-clean` (eliminado post-merge).

### C1.2 🟡 `escapeHtml()` definida 5 veces independientemente

| Archivo | Línea | Contexto |
|---------|-------|----------|
| `src/lib/clientSearch.ts` | 34 | Módulo TS |
| `src/components/cronograma/lib/utils.ts` | 38 | Módulo TS |
| `CalidadContent.astro` | 1394 | inline `<script>` |
| `AsignacionContent.astro` | 794 | inline `<script>` |
| `ContactosContent.astro` | 425 | inline `<script>` |

**Fix:** Consolidar en `src/lib/sanitize.ts` con exportación para SSR y cliente.
**Esfuerzo:** 15 min.

---

## P1 — Componentes UI reutilizables

### C3.1 ✅ 11 `<dialog>` raw sin usar `Modal.astro` — **RESUELTO**

Ya existe `src/components/ui/Modal.astro` pero 11 modales se construyen manualmente:

| Archivo | Línea | Modal ID |
|---------|-------|----------|
| ~~`CalidadContent.astro`~~ | ~~1047~~ | ~~`audit-modal`~~ |
| ~~`CalidadContent.astro`~~ | ~~1220~~ | ~~`month-summary-modal`~~ |
| ~~`CalidadContent.astro`~~ | ~~1255~~ | ~~`parameters-modal`~~ |
| *`AsignacionContent.astro`* | *201* | *`modal-marcar-excepcion`* |
| ~~`DirectorioContent.astro`~~ | ~~558~~ | ~~`region-referents-modal`~~ |
| ~~`TerminalModal.astro`~~ | ~~5~~ | ~~`terminal-modal`~~ |
| ~~`RulesSettingsModal.astro`~~ | ~~8~~ | ~~`rules-settings-modal`~~ |
| ~~`OperatorFormModal.astro`~~ | ~~27~~ | ~~`operator-form-modal`~~ |
| ~~`NewMonthModal.astro`~~ | ~~10~~ | ~~`new-month-modal`~~ |
| ~~`HolidaysModal.astro`~~ | ~~8~~ | ~~`holidays-modal`~~ |
| ~~`feedbackModal.astro`~~ | ~~10~~ | ~~`feedback_modal`~~ |

**Fix aplicado:** Todos los modales migrados `<dialog>` → `<Modal>`. Se eliminaron clases custom (`border`, `shadow-*`, `rounded-*`, `p-6`) de `Modal.astro` y todos los call sites, dejando defaults DaisyUI. *`AsignacionContent.astro` ya usaba `<Modal>` previamente.*

**Rama:** `fix/c31-modal-consolidation`.
**Esfuerzo real:** ~1.5 h. **Impacto real:** -300+ líneas.

### C2.1 🟡 Patrón StatsCard: 10+ instancias

Mismo layout de tarjeta de estadísticas (icono + label + número + subtítulo)
repetido 6 veces en CalidadContent (líneas 534-653) y 4 en AsignacionContent
(líneas 280-510).

**Fix:** Crear `src/components/ui/StatsCard.astro` con props: `icon`, `label`,
`value`, `subtitle`, `color`, `size`, `accentIcon`.
**Esfuerzo:** 30 min. **Impacto:** -200+ líneas.

### C2.2 🟡 Patrón FilterButtonBar: 4 instancias

Misma barra de botones de filtro con dots de color copiada 4 veces en
CronogramaDashboard (daily status, daily location, monthly status, monthly location).

**Fix:** Crear `src/components/ui/FilterButtonBar.astro` con props: `options[]`,
`prefix`, `allLabel`.
**Esfuerzo:** 30 min. **Impacto:** -120+ líneas.

### C2.3 🟡 Patrón SortDropdown: 4 instancias

Mismo dropdown de ordenamiento (A-Z, Z-A, horario, ubicación) copiado 2 veces
en CronogramaDashboard + input de búsqueda con icono duplicado.

**Fix:** Crear `src/components/ui/SortDropdown.astro`.
**Esfuerzo:** 30 min.

### C2.4 🟡 Patrón GroupCard: 4 instancias

Cards de grupos A/B/C/D en CronogramaDashboard (líneas 918-1111) con la misma
estructura repetida 4 veces.

**Fix:** Crear `src/components/cronograma/subcomponents/GroupCard.astro`.
**Esfuerzo:** 30 min.

---

## P2 — Consolidación de patrones admin

### C3.2 🟡 3 páginas admin CRUD casi idénticas (690 líneas c/u)

| Archivo | Líneas | Dominio |
|---------|--------|---------|
| `AdminContactsContent.astro` | 674 | Contactos + Categorías |
| `AdminRecursosContent.astro` | 690 | Recursos + Categorías |
| `AdminAplicativosContent.astro` | 694 | Aplicativos + Categorías |

Todas siguen: fetch categorías → sidebar con drag-drop → DataTable → reorder →
delete modal.

**Fix:** Crear `src/components/admin/ui/AdminCategorizedList.astro` genérico.
**Esfuerzo:** 3-4 h. **Impacto:** -1000+ líneas.

### C3.3 ✅ 10 archivos `eliminar.ts` con la misma estructura — **RESUELTO**

Los 10 endpoints de eliminación siguen: auth check → base → validate → delete →
log action → redirect.

**Fix aplicado:** Se creó `src/lib/api/deleteHandler.ts` con `createDeleteHandler(config)`
y `src/lib/api/deleteCategory.ts` con `createCategoryDeleteHandler(config)` para los
3 archivos de categoría con cascade/unassign. Los 10 archivos `eliminar.ts` se
redujeron a thin wrappers (10-22 líneas c/u) y se eliminó un helper compartido
`src/lib/api/deleteAppFile.ts` para borrado de archivos físicos de aplicativos.

**Rama:** `fix/c33-delete-handler-factory` (~190 líneas netas eliminadas).
**Esfuerzo real:** ~2 h. **Impacto real:** -190 líneas netas (3 archivos nuevos, 10 reducidos).

### C3.4 ✅ 22 archivos con POST + redirect con toast — **RESUELTO**

Mismo patrón try/catch + redirect con query params de toast.

**Fix aplicado:** Se crearon `src/lib/api/redirectWithToast.ts` y `src/lib/api/toastResponse.ts`.
Los 21 archivos migraron del patrón inline `Astro.redirect(resolveUrl(\`/?toast_msg=...&toast_type=...\`))`
a invocaciones de una línea con `redirectWithToast("/path", "msg")` y `toastResponse({...})`.
Se excluyó `login/index.astro` (3 redirects de validación de formulario).

**Rama:** `fix/c34-redirect-with-toast` (-41 líneas netas).
**Esfuerzo real:** ~40 min. **Impacto real:** -41 líneas netas (2 helpers nuevos, 21 archivos simplificados).

### C3.5 🟡 `logAdminAction` wrapper en 14 archivos

`await logAdminAction(Astro.locals.user?.username || 'Sistema', msg)`.

**Fix:** `logAdminFromAstro(locals, message)`.
**Esfuerzo:** 15 min.

### C3.6 ✅ `animate-fade-in` CSS en 3 archivos scoped — **RESUELTO**

Mismo `@keyframes fadeIn` en `CalidadContent.astro`, `DirectorioContent.astro`,
`SoportesPublicContent.astro`.

**Fix aplicado:** Movido a `src/styles/global.css` como `@keyframes fade-in` + `.animate-fade-in { animation: fade-in 0.4s ease-out forwards; }`.
Eliminadas las 3 definiciones scoped (~30 líneas borradas).
**Esfuerzo real:** 5 min.

### C3.7 🟢 `formatMonthLabel()` duplicado

Misma función de nombres de meses en SSR (línea 66) y client script (línea 1401)
de CalidadContent.

**Fix:** `src/lib/monthUtils.ts`.
**Esfuerzo:** 5 min.

---

## P3 — Scripts inline a módulos

### C4.1 🟡 10 archivos con scripts inline >50 líneas

| Archivo | Líneas de script | Contenido |
|---------|-----------------|-----------|
| `CalidadContent.astro` | ~1,500 | UI rendering, modals, CSV |
| `AsignacionContent.astro` | ~700 | Polling, lock, queue |
| `AdminContactsContent.astro` | ~400 | Search, drag-drop |
| `AdminRecursosContent.astro` | ~400 | Same |
| `AdminAplicativosContent.astro` | ~380 | Same |
| `DirectorioContent.astro` | ~500 | Map, list, drawer |
| `TerminalModal.astro` | ~350 | Terminal management |
| `CopyButton.astro` | ~380 | Copy-to-clipboard |
| `BuscadorUsuariosContent.astro` | ~400 | User search |
| `SignatureGenerator.astro` | ~350 | Signature rendering |

**Fix:** Extraer a companion `.ts` files. El módulo Cronograma ya hace esto bien
con `lib/dashboard-client.ts`, `lib/monthly-view.ts`, etc.
**Esfuerzo:** 4-6 h (progresivo).

### C3.8 ✅ Patrón `window.showToast` inconsistente — **RESUELTO**

Tres patrones diferentes en 17 archivos:
- Pattern A: `window.showToast?.(msg, "alert-error")` (6 archivos)
- Pattern B: `if (window.showToast) { ... }` (8 archivos)
- Pattern C: `import { showToast } from "@/lib/toastClient"` (3 archivos)

**Fix aplicado:** Los scripts bundled (`AdminAplicativosContent`) migraron a `import { showToast }`.
Los scripts `is:inline` (~20 archivos) estandarizaron a `window.addEventListener('load', () => window.showToast?.(msg, type))`,
eliminando todo el polling (`setTimeout`) y el objeto `window.load` / `DOMContentLoaded` boilerplate.
Normalizado el import path de `notifications.ts` a `@lib/toastClient`.

**Rama:** `fix/c38-showToast-consistency`.
**Esfuerzo real:** ~30 min. **Impacto real:** -100+ líneas eliminadas (polling/guard boilerplate).

---

## Plan de Acción — Componentización

| Prioridad | ID | Hallazgo | Esfuerzo | Impacto |
|-----------|-----|----------|----------|---------|
| **P0** | C1.1 | ~~🔴 base/cleanBase utility (80+ copias)~~ | ✅ **Resuelto** | ✅ `master` (01a3d91) |
| **P0** | C1.2 | 🟡 escapeHtml consolidado (5 defs) | 15 min | DRY |
| **P1** | C3.1 | ~~🔴 11 diálogos raw → Modal.astro~~ | ✅ **Resuelto** | ✅ rama `fix/c31-modal-consolidation` |
| **P1** | C2.1 | 🟡 StatsCard component (10+ usos) | 30 min | -200+ líneas |
| **P1** | C2.2 | 🟡 FilterButtonBar (4 instancias) | 30 min | -120+ líneas |
| **P1** | C2.3 | 🟡 SortDropdown (4 instancias) | 30 min | -80+ líneas |
| **P1** | C2.4 | 🟡 GroupCard (4 instancias) | 30 min | -100+ líneas |
| **P2** | C3.2 | 🟡 Admin CRUD consolidation (3 files) | 3-4 h | -1000+ líneas |
| **P2** | C3.3 | ~~🟡 deleteHandler factory (10 files)~~ | ✅ **Resuelto** | ✅ rama `fix/c33-delete-handler-factory` |
| **P2** | C3.4 | ~~🟡 redirectWithToast helper (22 files)~~ | ✅ **Resuelto** | ✅ rama `fix/c34-redirect-with-toast` |
| **P2** | C3.5 | 🟡 logAdminFromAstro wrapper (14 files) | 15 min | DRY |
| **P2** | C3.6 | ~~🟢 animate-fade-in global~~ | ✅ **Resuelto** | ✅ `master` (this commit) |
| **P2** | C3.7 | 🟢 formatMonthLabel consolidado | 5 min | DRY |
| **P3** | C4.1 | 🟡 Scripts inline → .ts (10 archivos) | 4-6 h | Separación concerns |
| **P3** | C3.8 | ~~🟢 showToast pattern estandarizado~~ | ✅ **Resuelto** | ✅ rama `fix/c38-showToast-consistency` |

**Total esfuerzo estimado:** ~15-22 h.
**Impacto estimado:** -2500+ líneas, reducción masiva de duplicación.

### Leyenda

- **P0:** DRY utilities — mayor impacto con menor esfuerzo.
- **P1:** Componentes UI reutilizables.
- **P2:** Consolidación de patrones admin.
- **P3:** Scripts inline a módulos separados.
