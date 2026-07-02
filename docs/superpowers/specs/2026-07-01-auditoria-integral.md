# Auditoría — Hallazgos Pendientes

**Fecha:** 2026-07-02 (8.ª pasada)
**Base:** Auditoría 2026-07-01, depurada de hallazgos resueltos en plan de almacenamiento unificado

---

## Resumen

| Estado | Cantidad |
|--------|----------|
| 🔴 Pendientes (arrastrados de pasadas anteriores) | 5 items |
| 🔴 Nuevos en esta pasada | 9 items |
| ✅ Resueltos (acumulado histórico) | 25 |

---

## P0 — Seguridad (urgencia)

### 1.5 🔴 `security.checkOrigin: false` en `astro.config.mjs` (arrastrado)

Sigue desactivando la validación CSRF/origen de Astro. Sin cambios.

**Fix:** Setear a `true` y verificar que los formularios POST no requieran origen cruzado.
**Esfuerzo:** 5 min.

---

### 1.6 🔴 `ENCRYPTION_KEY` vs `ENCRYPTION_MASTER_KEY` — cifrado roto (NUEVO)

`src/lib/encryption.ts` (líneas 12, 46) lee `process.env.ENCRYPTION_MASTER_KEY`, pero `.env` define `ENCRYPTION_KEY`. El cifrado cae siempre al fallback inseguro `"dev_key_must_be_configured_in_env"`. Las credenciales almacenadas en `resourceLinks.credential_username` / `credential_password` (plaintext) no se cifran realmente.

**Fix:** Unificar nombre a `ENCRYPTION_KEY` en `encryption.ts`. Validar al inicio que la clave real esté configurada.
**Archivos:** `src/lib/encryption.ts`, `.env`, `AGENTS.md`
**Esfuerzo:** 10 min.

---

### 1.7 ✅ ~~Rutas absolutas `C:/Projects/...` en 8 archivos~~ (RESUELTO 2026-07-02)

Se eliminaron las 8 ocurrencias de `C:/Projects/...` y se unificó el almacenamiento bajo un solo `EXTERNAL_STORAGE_DIR` con subcarpetas `apps/`, `icons/`, `pdfs/`.

| Archivo | Antes | Después |
|---------|-------|---------|
| `src/lib/storage.ts` (nuevo) | — | `getAppsDir()`, `getIconsDir()`, `getPdfsDir()` |
| `src/lib/iconUpload.ts` | `path.resolve("C:/...")` | `getIconsDir()` |
| `api/icons/[filename].ts` | `STORAGE_DIR = "C:/..."` | `getIconsDir()` |
| `api/download/[filename].ts` | `STORAGE_DIR = "C:/..."` | `getAppsDir()` |
| `api/aplicativos/pdf/[id].ts` | `EXTERNAL_PRIVATE_DIR` `"C:/..."` | `getPdfsDir()` |
| `admin/aplicativos/create.astro` | 2x `C:/...` | `getAppsDir()` + `getPdfsDir()` |
| `admin/aplicativos/edit/[id].astro` | 2x `C:/...` | `getAppsDir()` + `getPdfsDir()` |
| `eliminar.ts` + `categorias/eliminar.ts` | `C:/...` | `getAppsDir()` |

Además:
- Se creó `scripts/migrate-storage.ts` para migrar archivos existentes a la nueva estructura.
- Se creó `.env.example` con todas las variables documentadas.
- Se declaró `EXTERNAL_STORAGE_DIR` en `env.d.ts`.
- `EXTERNAL_PRIVATE_DIR` se eliminó (absorbido por `{STORAGE}/pdfs/`).

**Fix aplicado:** Almacenamiento unificado + utilidad centralizada `src/lib/storage.ts`.
**Esfuerzo real:** ~90 min (13 tareas atómicas, incluyendo revisión).

---

### 1.9 🟡 URLs `http://` hardcodeadas — sin configuración (NUEVO)

`src/components/buscador-usuarios/BuscadorUsuariosContent.astro` líneas 548, 634, 753: `http://mda.correo.local/api_mda_find_extension/get_users.php`

**Fix:** Mover a variable de entorno o archivo de configuración.
**Esfuerzo:** 10 min.

---

## P1 — Alto impacto en mantenibilidad

### 3.1 🔴 15 diálogos `<dialog>` raw sin refactorizar (arrastrado)

De 21 originales, se refactorizaron 9 en Grupos A+B. Quedan **15 diálogos raw** en 12 archivos — sin cambios vs pasada anterior.

| Archivo | Diálogos |
|---------|----------|
| `TerminalModal.astro` | 1 |
| `CalidadContent.astro` | 3 |
| `admin/feedback.astro` | 1 |
| `CronogramaDashboard.astro` | 1 (inline) |
| `HolidaysModal.astro` | 1 |
| `NewMonthModal.astro` | 1 |
| `OperatorFormModal.astro` | 1 |
| `RulesSettingsModal.astro` | 1 |
| `DirectorioContent.astro` | 1 |
| `UbicacionesContent.astro` | 1 |
| `ui/modals/commandPaletteModal.astro` | 1 |
| `ui/modals/aboutProjectModal.astro` | 1 |
| `ui/modals/feedbackModal.astro` | 1 |

**Fix:** Aplicar `Modal.astro` a candidatos directos. Evaluar extensión para cronograma y calidad.
**Esfuerzo:** 2-3 h. **Impacto:** -300+ líneas.

---

### 3.2 🔴 41 errores de TypeScript (NUEVO)

Cero errores en pasadas anteriores. 41 errores detectados por `npx astro check`:

| # | Archivo | Error |
|---|---------|-------|
| 1-5 | `OfficeRow.astro` | `any` en asset lookups + import `@types/offices` roto |
| 6-14 | `EstadisticasContent.astro` | Parámetros `any` implícitos en callbacks Chart.js |
| 15 | `CronogramaContent.astro` | Prop `initialData` inexistente en Dashboard |
| 16-17 | `CopyButton.astro` | `_copyButtonHandlerAttached` en `Document` |
| 18-25 | `admin/aplicativos/create.astro` | `maxLength` vs `maxlength`, type mismatch `number|string`, columna `title` inexistente |
| 26-30 | `admin/aplicativos/edit/[id].astro` | ídem create + `string | null` no asignable a `number` |
| 31+ | admin contactos | `categoryId` type mismatches |

**Fix:** Corregir tipos, props, y alinear con esquema DB.
**Esfuerzo:** 2-3 h.

---

### 3.3 🟡 `innerHTML` masivo (100+ usos) (NUEVO)

Potencial vector XSS si algún contenido es controlado por el usuario. Concentrado en:

| Archivo | Usos aprox. |
|---------|-------------|
| `src/components/cronograma/lib/dashboard-client.ts` | 20+ |
| `src/components/cronograma/lib/monthly-view.ts` | 12+ |
| `src/components/buscador-usuarios/BuscadorUsuariosContent.astro` | 15+ |
| `src/pages/generador-firmas/_components/SignatureGenerator.astro` | 6+ |
| `src/components/inventario/InventarioContent.astro` | 3 |
| `src/components/cronograma/lib/weekly-schedule.ts` | varios |
| `src/lib/clientSearch.ts` | 1 |
| `src/lib/toastClient.ts` | 1 |

**Fix:** Migrar gradualmente a APIs DOM seguras (`textContent`, `createElement`, `appendChild`).
**Esfuerzo:** 4-6 h (progresivo, por módulo).

---

### 3.4 🟡 `any` types (100+) (NUEVO)

Uso extensivo de `any` que desactiva TypeScript en archivos clave:

| Archivo | Patrón |
|---------|--------|
| `src/actions/index.ts` | `(context.locals as any)` repetido 6+ veces |
| `src/components/buscador-usuarios/BuscadorUsuariosContent.astro` | 15+ casts a `any` |
| `src/components/offices/DirectorioContent.astro` | `any` con Leaflet |
| `src/hooks/useTitlesHook.tsx` | tipos `any` generalizados |
| `src/db/schema.ts` | helpers relacionales |

**Fix:** Tipar progresivamente, priorizando `actions/index.ts` y componentones de supervisión.
**Esfuerzo:** 2-4 h.

---

### N3.11 🟡 Botones repetidos (18 instancias) (arrastrado)

Botones de acción en cronograma modals y CalidadContent con estructura idéntica — 4 más que en la auditoría original (se agregaron en `notifications.ts`).

| Patrón | Conteo |
|--------|--------|
| `btn btn-sm btn-ghost hover:bg-base-200 text-xs font-black uppercase` | 9 |
| `btn btn-sm btn-secondary text-xs font-black uppercase` | 9 |

**Fix:** Crear componente `ActionButton` o clase compartida.
**Esfuerzo:** 30 min. **Impacto:** -50+ líneas.

---

## P2 — Mejora de calidad

### N3.9 🟡 `text-tiny font-black uppercase tracking-wider` 35 veces (arrastrado)

Aparece exclusivamente en `CronogramaDashboard.astro` (33) + `monthly-view.ts` (1) + `weekly-schedule.ts` (1). Sin cambios.

**Fix:** Extraer a clase CSS compartida o componente `SectionHeading`.
**Esfuerzo:** 15 min.

---

### 2.1 ✅ ~~Clases Tailwind v3 deprecadas~~ (RESUELTO 2026-07-01)

Se eliminaron todas las clases deprecadas ~44 ocurrencias en ~30 archivos:

| Cambio | Archivos |
|--------|----------|
| `flex-shrink-0` → `shrink-0` | `toastClient.ts` |
| `leading-tight` eliminado (14 usos) | `drawerContent.astro`, `ChromeExtensionBanner.astro`, `UserCard.astro`, `DirectorioContent.astro`, `CronogramaDashboard.astro`, `DeleteCategoryModal.astro`, `AsistenciaContent.astro`, `profile.astro`, `aboutProjectModal.astro`, `CatalogAppCard.astro`, `cubics/edit/[id].astro`, `rotation-helper.ts` |
| `leading-none` eliminado (9 usos) | `drawerContent.astro`, `BuscadorUsuariosContent.astro`, `CalidadContent.astro`, `AsignacionContent.astro`, `aboutProjectModal.astro`, `monthly-view.ts`, `drawer.ts` |
| `leading-relaxed` eliminado (23 usos) | `ChromeExtensionBanner.astro`, `TerminalModal.astro`, `InventarioContent.astro`, `CronogramaDashboard.astro`, `MonthlyDetailModal.astro`, `AuditLogsTimeline.astro`, `AnnouncementBanner.astro`, `DeleteCategoryModal.astro`, `ColorSwatch.astro`, `DesignSystemSection.astro`, `CalidadContent.astro`, `EstadisticasContent.astro`, `QuickAccessCard.astro`, `PageHeader.astro`, `SearchEmptyState.astro`, `index.astro`, `profile.astro`, `admin/feedback.astro`, `aboutProjectModal.astro`, `CatalogAppCard.astro`, `CatalogBundleBanner.astro`, `notifications.ts` |
| `object-contain` | Sin cambio (sigue siendo válida en v4) |

**Decisión:** Se eliminaron todas las clases `leading-*` del markup, dejando que el line-height default del navegador (~1.5 para Geist Variable) uniformice la tipografía. No se registraron en `@theme` porque la intención era simplificar, no preservar valores legacy.

---

### 2.2 🟡 Colores hardcodeados violan DESIGN.md (NUEVO)

AGENTS.md exige usar solo tokens DaisyUI, nunca hardcodear hex.

#### ✅ White/black reemplazados por `*-content` (2026-07-02)

Se reemplazaron todas las clases con `white`/`black` de la escala de grises por su equivalente semántico DaisyUI, priorizando contraste.

| Archivo | Antes | Después | Líneas |
|---------|-------|---------|--------|
| `aboutProjectModal.astro` | `text-white` (×3), `bg-white/10`, `hover:bg-white/15`, `ring-white/20` | `text-secondary-content`, `bg-secondary-content/10`, `hover:bg-secondary-content/15`, `ring-secondary-content/20` | 27, 35, 44, 48, 54 |
| `aboutProjectModal.astro` | `ring-white/30` (sobre `bg-primary`) | `ring-primary-content/30` | 58 |
| `AsignacionContent.astro` | `badge-success text-white` (×2), `bg-white animate-ping` (×2) | `badge-success text-success-content`, `bg-success-content animate-ping` | 148, 703, 1308, 1310 |
| `AsignacionContent.astro` | `badge-error text-white` | `badge-error text-error-content` | 1320 |
| `AsignacionContent.astro` | `badge-info text-white` | `badge-info text-info-content` | 1322 |
| `SupportGuideRow.astro` | `bg-secondary text-white` | `bg-secondary text-secondary-content` | 74 |

**13 ocurrencias en 3 archivos.**

#### 🟡 Se conservaron (colores representativos de dominio)

| Archivo | Clases | Motivo |
|---------|--------|--------|
| `CronogramaDashboard.astro` | `bg-amber-500 text-white`, `bg-purple-500 text-white` | Colores MG/PP representativos para tipos de día; no existe token DaisyUI equivalente |
| `SignatureGenerator.astro` | `bg-white` | Canvas intencional que simula fondo blanco de email |
| `AsistenciaContent.astro` | `text-slate-500`, `border-slate-300` y otros colores de paleta v3 | Ausencia types con colores representativos de estado |

**Fix pendiente:** Reemplazar colores de paleta v3 en `AsistenciaContent.astro` (slate, amber, emerald, rose, etc.) y colores representativos de cronograma por tokens DaisyUI o, en su defecto, registrar colores custom en `@theme`.
**Esfuerzo restante estimado:** 30 min.

---

### 2.3 🟢 Variables declaradas sin usar (NUEVO)

**`isNew`** — declarada en 15+ admin create/edit pages y nunca leída:

`src/pages/admin/aplicativos/create.astro`, `src/pages/admin/aplicativos/edit/[id].astro`, `src/pages/admin/aplicativos/categorias/create.astro`, `src/pages/admin/aplicativos/categorias/edit/[id].astro`, `src/pages/admin/contactos/create.astro`, `src/pages/admin/contactos/edit/[id].astro`, `src/pages/admin/contactos/categoria/create.astro`, `src/pages/admin/contactos/categoria/edit/[id].astro`, `src/pages/admin/operadores/create.astro`, `src/pages/admin/operadores/edit/[id].astro`, `src/pages/admin/recursos/categoria/create.astro`, `src/pages/admin/recursos/enlace/create.astro`, `src/pages/admin/recursos/enlace/edit/[id].astro`, `src/pages/inventario-terminales/cubics/create.astro`, `src/pages/inventario-terminales/cubics/edit/[id].astro`

**`cleanBase`** — declarada sin usar en 12+ archivos (todos los admin pages que usan `resolveUrl`).

**`successMsg` / `toastMessage`** — declaradas y asignadas pero el string se usa inline en `redirect()`, la variable no se referencia.

**Imports sin usar:**
- `Icon` de `astro-icon/components` — en 5+ archivos
- `FormLegend` — en 4 admin pages
- `eq` de `drizzle-orm` — en `contactos/create.astro`, `operadores/create.astro`
- `desc`, `asc` — en `officeQueries.ts`

**Fix:** Limpiar imports y variables muertas.
**Esfuerzo:** 15 min.

---

### 2.4 🟢 Admin CRUD pattern inconsistente (NUEVO)

| Inconsistencia | Ejemplos |
|----------------|----------|
| Breadcrumb manual vs botón "X" | `contactos/create.astro` usa breadcrumbs `<a>` ; `aplicativos/create.astro` usa "X" close |
| `resolveUrl()` vs `cleanBase` | `aplicativos/` usa `resolveUrl()` ; `contactos/` y `operadores/` usan `cleanBase` |
| Error display pattern | Categorías usan `setTimeout` fallback ; otros usan `window.showToast?.()` directo |
| `AsyncFormScript` ubicación | Algunos lo tienen fuera de `BaseLayout`, otros adentro |

**Fix:** Unificar siguiendo el patrón documentado en `.agents/skills/admin-crud-pattern/`.
**Esfuerzo:** 1 h.

---

## P3 — Buenas prácticas / rendimiento marginal

### 4.1 🟢 React — Single island (arrastrado)

~450 líneas React total. Sin cambios significativos vs pasada anterior.

| Componente | Líneas | Estado |
|------------|--------|--------|
| `useTitlesHook.tsx` | 185 | ✅ Justifica React |
| `TitlesContainer.tsx` | 95 | ✅ Entry island |
| `TitleDrawer.tsx` | 74 | 🟢 Convertible a Astro |
| `TitleCard.tsx` | 67 | 🟡 Evaluar |
| `TitleCardSkeleton.tsx` | 29 | 🟢 Convertible (0 interactividad) |

**Fix:** Convertir `TitleDrawer` y `TitleCardSkeleton` a Astro.
**Esfuerzo:** 1 h. **Impacto:** -100+ líneas React.

---

### 3.1 🟢 Código muerto: `copyText` en `useTitlesHook` (NUEVO)

`src/hooks/useTitlesHook.tsx` líneas 202-217: función `copyText` y su fallback `fallbackCopyToClipboard` no son llamados por ningún código. El hook usa `navigator.clipboard.writeText` directamente en `copyToClipboard`.

**Fix:** Eliminar funciones muertas o integrarlas en el flujo de copiado real.
**Esfuerzo:** 5 min.

---

### 3.2 🟢 Scoped `<style>` duplicado (NUEVO)

`animate-fade-in` definido en scoped `<style>` de `CalidadContent.astro` (línea 1366) y `SoportesPublicContent.astro` (línea 294). Como son scoped, Astro genera clases hasheadas distintas, duplicando el CSS.

**Fix:** Mover a `global.css` y cambiar a `<style is:global>` o eliminar si ya existe globalmente.
**Esfuerzo:** 5 min.

---

### 3.3 🟢 npm audit: `undici` severidad HIGH (NUEVO)

7 advisories, severidad HIGH (GHSA-vmh5-mc38-953g — TLS certificate validation bypass).

**Fix:** Ejecutar `npm audit fix` o actualizar dependencia manualmente.
**Esfuerzo:** 5 min.

---

### 3.4 ✅ ~~Falta `.env.example`~~ (RESUELTO 2026-07-02)

Se creó `.env.example` con todas las variables documentadas:
- `EXTERNAL_STORAGE_DIR` (con subcarpetas `apps/`, `icons/`, `pdfs/`)
- `SESSION_SECRET`, `ENCRYPTION_KEY`
- `INVGATE_API_USERNAME`, `INVGATE_BASE_URL`, `INVGATE_API_KEY`

**Esfuerzo real:** Incluido en el plan de almacenamiento unificado.

---

## Plan de Acción

| Prioridad | ID | Hallazgo | Esfuerzo | Impacto |
|-----------|----|----------|----------|---------|
| **P0** | 1.5 | 🔴 `security.checkOrigin: false` | 5 min | Seguridad |
| **P0** | 1.6 | 🔴 ENCRYPTION_KEY mismatch — cifrado roto | 10 min | Seguridad |
| **P0** | 1.7 | ✅ ~~Rutas absolutas C:/Projects/ (8 archivos)~~ | 30 min | Portabilidad |
| **P0** | 1.8 | ✅ ~~EXTERNAL_PRIVATE_DIR faltante~~ (absorbido por 1.7) | — | — |
| **P0** | 1.9 | 🟡 URLs http:// hardcodeadas (3) | 10 min | Seguridad/Config |
| **P1** | 3.1 | 🔴 15 diálogos raw sin Modal.astro | 2-3 h | -300+ líneas |
| **P1** | 3.2 | 🔴 30 errores TypeScript (↓11 resueltos incidentalmente) | 2-3 h | Compilación |
| **P1** | 3.3 | 🟡 innerHTML masivo (100+ usos) | 4-6 h | XSS prevention |
| **P1** | 3.4 | 🟡 any types (100+) | 2-4 h | Type safety |
| **P1** | N3.11 | 🟡 Botones repetidos (18 instancias) | 30 min | -50+ líneas |
| **P2** | N3.9 | 🟡 text-tiny font-black 35 veces | 15 min | Mantenibilidad |
| **P2** | 2.1 | ✅ Clases Tailwind v3 deprecadas | 30 min | Compatibilidad |
| **P2** | 2.2 | 🟡 Colores hardcodeados violan DESIGN.md (✅ white/black → `*-content`, 🟡 resto pendiente) | 30 min (restante) | Consistencia visual |
| **P2** | 2.3 | 🟢 Variables/imports muertos (✅ parcial: create/edit aplicativos) | 15 min | Limpieza |
| **P2** | 2.4 | 🟢 Admin CRUD pattern inconsistente | 1 h | Consistencia |
| **P3** | 4.1 | 🟢 Migrar 3 componentes React → Astro | 1 h | -100+ React |
| **P3** | 3.1 | 🟢 Código muerto: copyText | 5 min | Limpieza |
| **P3** | 3.2 | 🟢 Scoped style duplicado | 5 min | Mantenibilidad |
| **P3** | 3.3 | 🟢 npm audit: undici HIGH | 5 min | Seguridad |
| **P3** | 3.4 | ✅ ~~Falta .env.example~~ (RESUELTO 2026-07-02) | 10 min | Onboarding |

**Total esfuerzo estimado:** 12-19 h (↓ por resolución de 1.7+1.8+3.4 y reducción incidental de TS errors).

### Leyenda

- **P0:** Riesgo de seguridad / portabilidad.
- **P1:** Alto impacto en mantenibilidad o compilación.
- **P2:** Mejora de calidad, esfuerzo bajo o mediano.
- **P3:** Buenas prácticas / limpieza marginal.
