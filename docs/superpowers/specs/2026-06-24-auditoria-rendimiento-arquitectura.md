# Auditoría de Rendimiento y Arquitectura

**Fecha:** 2026-06-25 (actualización post-intervención)
**Versión inicial:** 2026-06-24
**Proyecto:** correo-argentino-mda (Portal Mesa de Ayuda)
**Stack:** Astro v5 SSR + Tailwind v4 + DaisyUI v5 + Drizzle ORM + SQLite + React islands

---

## Resumen Ejecutivo

Se intervinieron **11 de 18 hallazgos** originales (61%). Quedan **7 pendientes** de la auditoría inicial y se agregaron **5 nuevos hallazgos** descubiertos en el re-análisis post-intervención.

| Estado | Cantidad |
|--------|----------|
| 🔴 Corregidos | 11 |
| 🟡 Pendientes originales | 7 |
| 🆕 Nuevos hallazgos | 5 |

Total: **18 intervenidos** de los cuales 11 están resueltos, 7 aún pendientes, y 5 son nuevos descubrimientos.

---

## Hallazgos Corregidos (11)

| ID | Hallazgo | Severidad | Resolución | Commit(s) |
|----|----------|-----------|------------|-----------|
| 1.1 | `@libsql/client` y `@astrojs/mdx` en `dependencies` — No utilizados | 🔴 | Removidos de `dependencies` | Sesión anterior |
| 1.2 | `typescript` y `@astrojs/check` en `dependencies` | 🟡 | Movidos a `devDependencies` | Sesión anterior |
| 1.3 | `cheerio` en `dependencies` | 🟡 | Movido a `devDependencies` | Sesión anterior |
| 1.4 | `glob` en `devDependencies` — No utilizado | 🟡 | Removido | Sesión anterior |
| 1.7 | Alias `@middleware/*` apunta a directorio inexistente | 🟡 | Alias removido de `tsconfig.json` | `59a6f8b` |
| 2.1 | ~13 MB de screenshots PNG en `public/images/` | 🔴 | Movidos a `docs/screenshots/` (fuera de `public/`) | `0ed329f` |
| 2.2 | `argentina_provincias.geojson` (505 KB) | 🟢 | Convertido a TopoJSON (31 KB, -94%), actualizado `DirectorioContent.astro` | `0ed329f` |
| 2.4 | Falta `robots.txt` | 🟢 | Creado `public/robots.txt` | `0ed329f` |
| 3.4 | `resolveUrl` definido en 15 archivos | 🟡 | Extraído a `src/lib/url.ts` como función compartida. 15 archivos actualizados | `3dbcea4` |
| 3.5 | Triple modal de eliminación de categoría (~105 líneas duplicadas) | 🔴 | Extraído a `src/components/ui/DeleteCategoryModal.astro`. 3 content components actualizados (-74 líneas netas) | `9877c30` |
| 3.7 | Guard de acceso inline repetido en 5+ páginas | 🟡 | Centralizado en `routePermissions` + middleware `hasPermission()`. Guards removidos de 15+ archivos de página. 28 tests RBAC agregados | 7 commits (sesión 3.7) |

---

## Hallazgos Pendientes (de la auditoría original)

### 1.5 🔴 `security.checkOrigin: false` en `astro.config.mjs`

**No intervenido.** Sigue desactivando la validación CSRF/origen de Astro.

**Estado:** ❌ Sin cambios desde la auditoría inicial.
**Fix:** Setear a `true` y verificar que los formularios POST no requieran origen cruzado. Si hay un caso legítimo, documentarlo con comentario.
**Esfuerzo:** 5 min.
**Impacto:** Seguridad.

### 1.6 🟡 `NODE_ENV="development"` hardcodeado en esbuild define

**No intervenido.** Sigue presente:

```js
vite: {
  optimizeDeps: {
    esbuildOptions: {
      define: { "process.env.NODE_ENV": JSON.stringify("development") },
    },
  },
},
```

**Estado:** ❌ Sin cambios.
**Fix:** Remover el bloque `optimizeDeps` o condicionarlo a `import.meta.env.DEV`.
**Esfuerzo:** 5 min.
**Impacto:** Calidad de build.

### 2.3 🟢 CSS bundle ~263 KB

**Estado:** ❌ No intervenido. Peso esperado con DaisyUI completo. Monitoreable.
**Fix:** Purgar componentes DaisyUI no utilizados (postcss purge).
**Esfuerzo:** 30 min.
**Impacto:** Rendimiento (mejorable pero no crítico).

### 3.1 🔴 ~20 diálogos `<dialog>` raw sin refactorizar

Se intervinieron ~10 modales en M-02 (7 archivos), pero quedan **20 diálogos raw** en **13 archivos** que no usan `Modal.astro`:

| Archivo | Diálogos | Nota |
|---------|----------|------|
| `src/layouts/BaseLayout.astro` | 2 (command-palette, about-project) | Candidato directo |
| `src/components/support-guides/SupportGuideRow.astro` | 1 | Candidato directo |
| `src/components/buscador-usuarios/TerminalModal.astro` | 1 | Candidato directo |
| `src/components/buscador-usuarios/EditUserModal.astro` | 1 | Candidato directo |
| `src/components/supervision/asignacion/AsignacionContent.astro` | 1 | Candidato directo |
| `src/components/supervision/calidad/CalidadContent.astro` | 3 | Custom z-index y estilos — evaluar |
| `src/components/admin/users/AdminUsersContent.astro` | 4 | Candidato directo |
| `src/components/ui/DeleteCategoryModal.astro` | 1 | Nuevo en 3.5 — refactorizar post creación |
| `src/components/cronograma/CronogramaDashboard.astro` | 1 (inline) | Patrón diferente (shadow-2xl, rounded-3xl) |
| `src/components/cronograma/subcomponents/HolidaysModal.astro` | 1 | Patrón cronograma |
| `src/components/cronograma/subcomponents/NewMonthModal.astro` | 1 | Patrón cronograma |
| `src/components/cronograma/subcomponents/OperatorFormModal.astro` | 1 | Patrón cronograma |
| `src/components/cronograma/subcomponents/RulesSettingsModal.astro` | 1 | Patrón cronograma |

**Nota:** Los modales de cronograma comparten un patrón visual distinto (`shadow-2xl rounded-3xl p-6`, heading `font-black uppercase tracking-tight`, `modal-backdrop`). Requerirían extender `Modal.astro` con variante de estilo o crear `CronogramaModal.astro`.

**Estado:** ⚠️ Parcial (10 corregidos, 20 pendientes).
**Fix:** Aplicar `Modal.astro` a los archivos marcados como "Candidato directo". Para cronograma, evaluar extensión del componente.
**Esfuerzo:** ~2-3 h para candidatos directos + 1-2 h para cronograma.
**Impacto:** -400+ líneas de boilerplate.

### 3.2 🟡 `SectionCard.astro` sin uso (dead code)

**El componente fue creado en M-01 pero NUNCA importado en ningún archivo del código fuente.** Es dead code.

Paralelamente, existen **~46 archivos** que construyen cards manualmente con `bg-base-100 border border-base-300 shadow-md/shadow-sm`. Entre ellos:

| Archivo | Instancias |
|---------|-----------|
| `OfficeForm.astro` | 6 |
| `SignatureGenerator.astro` | 3 |
| `AsignacionContent.astro` | 4 |
| Admin CRUD pages (create/edit, ~25 archivos) | 1-2 c/u |
| `profile.astro`, `admin/index.astro`, etc. | 2 c/u |

**Decisión requerida:** (a) Eliminar `SectionCard.astro` si no se justifica su existencia, o (b) aplicarlo a los 46 archivos que construyen cards manualmente.

**Estado:** ⚠️ Componente creado pero sin adoptar.
**Esfuerzo:** 5 min si se elimina; 2-3 h si se aplica a los 46 archivos.
**Impacto:** Mantenibilidad.

### 3.6 🟢 Clases de input/label repetidas

Se mantienen ~24 instancias del patrón de label y varias cadenas de input repetidas:

| Patrón | Conteo | Archivos principales |
|--------|--------|---------------------|
| `label-text font-bold text-xs uppercase text-base-content/60` | 17 | cronograma modals, CalidadContent |
| `label-text font-bold text-xs uppercase text-base-content/40 tracking-wider` | 6 | EditUserModal, AsignacionContent |
| `input-bordered input-sm font-bold w-(full\|32) focus:outline-none focus:border-secondary bg-base-100` | 6 | RulesSettingsModal, OperatorFormModal, NewMonthModal |
| `input-bordered input-sm font-mono font-bold w-full focus:outline-none focus:border-primary bg-base-100` | 3 | CalidadContent |
| `fieldset-legend font-semibold uppercase tracking-wide text-xs` (+ `mb-2`) | 20+ | Admin CRUD create/edit pages |
| `text-tiny font-black uppercase tracking-wider text-base-content/40` (+ variantes) | 32 | CronogramaDashboard |
| `input input-bordered w-full focus:input-primary` | 8 | soportes create/edit |
| `file-input file-input-bordered w-full` | 8 | Admin aps/recursos create/edit |
| `textarea textarea-bordered w-full h-24 focus:textarea-primary` (+ variantes) | 8 | soportes create/edit |
| `btn btn-sm btn-ghost hover:bg-base-200 text-xs font-black uppercase` | 7 | cronograma modals, CalidadContent |
| `btn btn-sm btn-secondary text-xs font-black uppercase` | 7 | cronograma modals, CalidadContent |

**Estado:** ❌ No intervenido (agravado por nuevos hallazgos).
**Fix:** Crear componentes `FormLabel`, `FormInput`, `FormTextarea` y reemplazar en todos los archivos.
**Esfuerzo:** ~3-4 h para cobertura completa.
**Impacto:** -350+ líneas de clases repetidas.

### 4.1 🟢 React — Single island (Titles)

**Estado:** ❌ No intervenido. Baja prioridad.

| Componente | Líneas | Estado |
|------------|--------|--------|
| `useTitlesHook.tsx` | 217 | ✅ Justifica React |
| `TitlesContainer.tsx` | 103 | ✅ Entry island |
| `TitleDrawer.tsx` | 85 | 🟢 Convertible a Astro |
| `TitleCard.tsx` | 74 | 🟡 Evaluar |
| `TitleCardSkeleton.tsx` | 30 | 🟢 Convertible a Astro |

**Fix:** Convertir TitleDrawer y TitleCardSkeleton a Astro. TitleCard evaluar. Dependencias React: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@astrojs/react`, `@heroicons/react`.
**Esfuerzo:** ~3-4 h completa; 1 h parcial (drawer + skeleton).
**Impacto:** -115 líneas React, simplifica toolchain.

---

## Nuevos Hallazgos (descubiertos en re-análisis 2026-06-25)

### N3.8 🟡 `fieldset-legend` repetido 20+ veces en admin CRUD

La clase `fieldset-legend font-semibold uppercase tracking-wide text-xs` aparece en todos los formularios de create/edit de admin/aplicativos, admin/recursos (categorías y enlaces), admin/contactos (categorías). La variante con `mb-2` duplica el conteo.

**Fix:** Crear componente `FormLegend.astro` o usar CSS `@apply` compartido.
**Archivos clave:** `admin/aplicativos/create.astro`, `admin/aplicativos/edit/[id].astro`, `admin/recursos/enlace/create.astro`, `admin/recursos/enlace/edit/[id].astro`, y sus contrapartes de categorías.
**Esfuerzo:** 30 min.
**Impacto:** -100+ líneas.

### N3.9 🟡 `text-tiny font-black uppercase tracking-wider` 32 veces en CronogramaDashboard

Una clase extremadamente específica que aparece exclusivamente en `CronogramaDashboard.astro` como headings de secciones (días, horarios, operadores).

**Fix:** Extraer a clase CSS compartida o componente de heading. Si es un solo archivo, aplicar refactor interno.
**Esfuerzo:** 15 min.
**Impacto:** Mantenibilidad de ese archivo (que ya es muy grande).

### N3.10 🟡 `input input-bordered w-full focus:input-primary` 8 veces en soportes

Patrón de input repetido en `soportes/create.astro` y `soportes/edit/[id].astro`. Aparece acompañado de `textarea textarea-bordered w-full h-24 focus:textarea-primary` (8 veces en los mismos archivos).

**Fix:** Mismo `FormInput` / `FormTextarea` propuesto en 3.6.
**Esfuerzo:** 30 min (incluido en 3.6).
**Impacto:** -60+ líneas.

### N3.11 🟡 `btn btn-sm btn-ghost` y `btn btn-sm btn-secondary` repetidos 7 veces c/u

Botones de acción en cronograma modals y CalidadContent con estructura idéntica.

| Patrón | Conteo | Ubicación |
|--------|--------|-----------|
| `btn btn-sm btn-ghost hover:bg-base-200 text-xs font-black uppercase` | 7 | RulesSettingsModal, HolidaysModal, OperatorFormModal, NewMonthModal, CalidadContent |
| `btn btn-sm btn-secondary text-xs font-black uppercase` | 7 | NewMonthModal, HolidaysModal, RulesSettingsModal, OperatorFormModal, CalidadContent |

**Fix:** Misma extracción que 3.6, o crear componente `ActionButton`.
**Esfuerzo:** 30 min.
**Impacto:** -50+ líneas.

### N3.12 🟢 `file-input file-input-bordered w-full` 8 veces en admin forms

Repetido en `admin/aplicativos/create.astro`, `admin/aplicativos/edit/[id].astro`, `admin/recursos/enlace/create.astro`, `admin/recursos/enlace/edit/[id].astro`.

**Fix:** Incluir en componente `FormInput` (3.6) con variante `type="file"`.
**Esfuerzo:** Incluido en 3.6.
**Impacto:** Mantenibilidad.

---

## Plan de Acción Recomendado (Actualizado)

| Prioridad | ID | Hallazgo | Esfuerzo | Impacto |
|-----------|----|----------|----------|---------|
| **P0** | 1.5 | 🔴 `security.checkOrigin: false` | 5 min | Seguridad |
| **P1** | 3.1 | 🔴 20 diálogos raw sin Modal.astro | 2-4 h | -400+ líneas boilerplate |
| **P1** | N3.8 | 🟡 `fieldset-legend` repetido 20+ veces | 30 min | Mantenibilidad |
| **P1** | N3.11 | 🟡 Botones btn-sm repetidos (14 instancias) | 30 min | Mantenibilidad |
| **P2** | 1.6 | 🟡 `NODE_ENV=development` en esbuild define | 5 min | Calidad build |
| **P2** | 3.2 | 🟡 SectionCard.astro dead code o adopción | 5 min-3 h | Mantenibilidad |
| **P2** | 3.6 / N3.10 / N3.12 | 🟢 Clases input/label/file repetidas | 3-4 h | -350+ líneas |
| **P2** | N3.9 | 🟡 `text-tiny font-black` 32 veces | 15 min | Mantenibilidad |
| **P3** | 2.3 | 🟢 CSS bundle 263 KB | 30 min | Rendimiento |
| **P3** | 4.1 | 🟢 Migrar TitleDrawer + Skeleton a Astro | 1 h | -115 líneas React |
| **P3** | 4.1 | 🟢 Migración React completa | 3-4 h | Toolchain simplificada |

### Leyenda de prioridades
- **P0:** Riesgo de seguridad.
- **P1:** Alto impacto en mantenibilidad, esfuerzo medio-alto pero recuperable en deuda técnica.
- **P2:** Mejora de calidad/build, esfuerzo bajo o mediano.
- **P3:** Buenas prácticas / rendimiento marginal.
