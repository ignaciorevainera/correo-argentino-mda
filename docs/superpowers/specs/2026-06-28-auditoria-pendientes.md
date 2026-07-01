# Auditoría — Hallazgos Pendientes

**Fecha:** 2026-06-29 (3.ª pasada)
**Base:** auditoría 2026-06-24, depurada de hallazgos resueltos (14 corregidos + N3.12 + 3.6/N3.10)

---

## Resumen

| Estado | Cantidad |
|--------|----------|
| 🔴 Pendientes | 9 items |
| ✅ Resueltos (sesiones previas + actual) | 17 |

---

## P0 — Seguridad

### 1.5 🔴 `security.checkOrigin: false` en `astro.config.mjs`

Sigue desactivando la validación CSRF/origen de Astro. Sin cambios.

**Fix:** Setear a `true` y verificar que los formularios POST no requieran origen cruzado.
**Esfuerzo:** 5 min.

---

## P1 — Alto impacto en mantenibilidad

### 3.1 🔴 15 diálogos `<dialog>` raw sin refactorizar

De 21 originales, se refactorizaron 9 en Grupos A+B (30 min). Quedan **15 diálogos raw** en 12 archivos:

| Archivo | Diálogos | Nota |
|---------|----------|------|
| `TerminalModal.astro` | 1 | Candidato directo |
| `CalidadContent.astro` | 3 | Custom z-index, evaluar |
| `admin/feedback.astro` | 1 | Candidato directo |
| `CronogramaDashboard.astro` | 1 (inline) | Patrón diferente (shadow-2xl, rounded-3xl) |
| `HolidaysModal.astro` | 1 | Patrón cronograma |
| `NewMonthModal.astro` | 1 | Patrón cronograma |
| `OperatorFormModal.astro` | 1 | Patrón cronograma |
| `RulesSettingsModal.astro` | 1 | Patrón cronograma |
| `DirectorioContent.astro` | 1 | Sin evaluar |
| `UbicacionesContent.astro` | 1 | Nuevo (admin invgate) |
| `ui/modals/commandPaletteModal.astro` | 1 | Extraído de BaseLayout |
| `ui/modals/aboutProjectModal.astro` | 1 | Extraído de BaseLayout |
| `ui/modals/feedbackModal.astro` | 1 | Extraído de FeedbackModal |

**Fix:** Aplicar `Modal.astro` a candidatos directos. Evaluar extensión para cronograma y calidad.
**Esfuerzo:** 2-3 h.
**Impacto:** -300+ líneas.

### N3.11 🟡 Botones repetidos (18 instancias)

Botones de acción en cronograma modals y CalidadContent con estructura idéntica:

| Patrón | Conteo | Ubicación |
|--------|--------|-----------|
| `btn btn-sm btn-ghost hover:bg-base-200 text-xs font-black uppercase` | 9 | RulesSettings, OperatorForm, NewMonth, Holidays, CalidadContent, notifications.ts |
| `btn btn-sm btn-secondary text-xs font-black uppercase` | 9 | NewMonth, Holidays, RulesSettings, OperatorForm, CalidadContent, notifications.ts |

Nota: aumentó de 14 a 18 vs auditoría original (se agregaron 4 en `notifications.ts`).

**Fix:** Crear componente `ActionButton` o clase compartida.
**Esfuerzo:** 30 min.
**Impacto:** -50+ líneas.

---

## P2 — Mejora de calidad

### 3.6 / N3.10 🟢 Clases de input/label repetidas **[RESUELTO 2026-06-29]**

Patrones repetidos que persistían (resueltos):

| Patrón | Conteo | Resolución |
|--------|--------|-----------|
| `label-text font-bold text-xs uppercase text-base-content/60` | 17 | Reemplazado vía FormField/FormTextarea/SelectField |
| `label-text font-bold text-xs uppercase text-base-content/40 tracking-wider` | 6 | Reemplazado vía FormField/SelectField |
| `label-text font-bold text-xs uppercase tracking-wider text-base-content/70` | 1 | Reemplazado vía SelectField |
| `input-bordered input-sm font-bold w-(full\|32) focus:outline-none focus:border-secondary bg-base-100` | 5 | Reemplazado vía FormField |
| `input-bordered input-sm font-mono font-bold w-full focus:outline-none focus:border-(primary\|secondary) bg-base-100` | 5 | Reemplazado vía FormField |
| `input input-bordered w-full focus:input-primary` (N3.10) | 8 | Reemplazado vía FormField |
| `textarea textarea-bordered w-full h-24 focus:textarea-primary` (N3.10) | 8 | Reemplazado vía FormTextarea |
| ⚠️ `file-input file-input-bordered w-full` | **0** ✅ | Resuelto vía FormField |

**Fix:** Se creó `FormTextarea.astro`, se extendió `FormField.astro` y `SelectField.astro` con prop `size`. Se reemplazaron raw elements en ~18 archivos abarcando soportes CRUD, FeedbackModal, EditUserModal, OfficeForm, admin/aplicativos, admin/contactos, OperatorFormModal, NewMonthModal, RulesSettingsModal, OperatorDrawer, CalidadContent, y AsignacionContent. Quedaron fuera por JS-coupling o custom styling: CronogramaDashboard (select con span hermano), HolidaysModal (inputs sin label), MonthlyDetailModal (table cell inputs con focus/ring custom).
**Esfuerzo:** ~2 h.
**Impacto:** ~450-500 líneas eliminadas en total.

### N3.9 🟡 `text-tiny font-black uppercase tracking-wider` 35 veces

Aparece exclusivamente en `CronogramaDashboard.astro` (33) + `monthly-view.ts` (1) + `weekly-schedule.ts` (1). Sin cambios vs pasada anterior.

**Fix:** Extraer a clase CSS compartida o componente `SectionHeading`.
**Esfuerzo:** 15 min.
**Impacto:** Mantenibilidad.

### 3.7 🟢 `UbicacionesContent.astro` — 7 form elements raw

`src/components/admin/invgate/UbicacionesContent.astro` contiene 5 inputs + 2 selects con clases `input-bordered`/`select-bordered` raw, sin usar FormField/SelectField. Sigue el mismo patrón admin CRUD ya refactorizado en aplicativos, contactos y soportes.

| Elemento | Clase |
|----------|-------|
| Filtro búsqueda (input) | `input input-bordered w-full pr-10` |
| Código (input) | `input input-bordered w-full` |
| Nombre (input) | `input input-bordered w-full` |
| Dirección (input) | `input input-bordered w-full` |
| Centro de costo (input) | `input input-bordered w-full` |
| Provincia (select) | `select select-bordered w-full` |
| Tipo (select) | `select select-bordered w-full` |

**Fix:** Reemplazar con FormField/SelectField (mismo patrón que 3.6).
**Esfuerzo:** 20 min.
**Impacto:** -60+ líneas.

### 3.8 🟢 `admin/feedback.astro` — 1 select raw + 1 dialog raw

`src/pages/admin/feedback.astro` contiene un `<select>` raw con clase `select select-bordered select-sm rounded-md` usado como filtro de estado, y un `<dialog>` raw para detalle de feedback.

**Fix:** Reemplazar select con SelectField, y dialog con Modal.astro si aplica.
**Esfuerzo:** 15 min.
**Impacto:** -20+ líneas.

---

## P3 — Buenas prácticas / rendimiento marginal

### 2.3 🟢 CSS bundle ~264 KB

Peso con DaisyUI completo: 264 KB (vs 263 KB original). Estable pero purgable.

**Fix:** Purgar componentes DaisyUI no utilizados.
**Esfuerzo:** 30 min.
**Impacto:** Rendimiento marginal.

### 4.1 🟢 React — Single island (Titles)

~450 líneas React total (vs 509 original). Sin cambios significativos.

| Componente | Líneas (hoy) | Líneas (original) | Estado |
|------------|-------------|-------------------|--------|
| `useTitlesHook.tsx` | 185 | 217 | ✅ Justifica React |
| `TitlesContainer.tsx` | 95 | 103 | ✅ Entry island |
| `TitleDrawer.tsx` | 74 | 85 | 🟢 Convertible a Astro |
| `TitleCard.tsx` | 67 | 74 | 🟡 Evaluar |
| `TitleCardSkeleton.tsx` | 29 | 30 | 🟢 Convertible a Astro |

**Fix:** Convertir TitleDrawer y TitleCardSkeleton a Astro.
**Esfuerzo:** 1 h parcial.
**Impacto:** -100+ líneas React.

### 4.2 🟡 `Modal.astro` — componente creado pero sin adopción **[RESUELTO 2026-06-28]**

`src/components/ui/Modal.astro` (53 líneas) fue creado como contenedor reutilizable de diálogos pero **no era importado por ningún archivo**.

**Fix:** Adoptarlo en los archivos compatibles (Grupos A+B: 9 diálogos en 5 archivos).
**Resolución (2026-06-28):** Se mejoró Modal.astro con props `zIndex`, `titleClass`, sizes `"2xl"/"3xl"`. Se reemplazaron 9 diálogos en:
- `EditUserModal.astro` — reemplazo directo
- `SupportGuideRow.astro` — vía `class` y `titleClass`
- `DeleteCategoryModal.astro` — formulario completo en content slot
- `AsignacionContent.astro` — heading custom en content slot
- `AdminUsersContent.astro` — 4 diálogos reemplazados

**Pendientes:** Los 15 diálogos restantes (Grupos C+D: cronograma, calidad, no-viables + nuevos hallazgos) quedan para futura sesión.
**Esfuerzo:** 30 min (Grupos A+B).
**Impacto:** Modal.astro pasa de 0 a 8 imports. -120 líneas de boilerplate.

---

## Plan de Acción

| Prioridad | ID | Hallazgo | Esfuerzo | Impacto |
|-----------|----|----------|----------|---------|
| **P0** | 1.5 | 🔴 `security.checkOrigin: false` | 5 min | Seguridad |
| **P1** | 3.1 | 🔴 15 diálogos raw sin Modal.astro | 2-3 h | -300+ líneas |
| **P1** | N3.11 | 🟡 Botones repetidos (18 instancias) | 30 min | -50+ líneas |
| **P2** | N3.9 | 🟡 `text-tiny font-black` 35 veces | 15 min | Mantenibilidad |
| **P2** | 3.7 | 🟢 UbicacionesContent — 7 form elements raw | 20 min | -60+ líneas |
| **P2** | 3.8 | 🟢 admin/feedback — select + dialog raw | 15 min | -20+ líneas |
| **P3** | 2.3 | 🟢 CSS bundle 264 KB | 30 min | Rendimiento |
| **P3** | 4.1 | 🟢 Migrar TitleDrawer + Skeleton a Astro | 1 h | -100+ líneas React |
| **P3** | 4.1 | 🟢 Migración React completa | 3-4 h | Toolchain simplificada |
| **—** | 3.6/N3.10 | 🟢 Clases input/label repetidas | 2 h | ✅ Resuelto (-450 líneas) |
| **—** | 4.2 | 🟡 Modal.astro sin adopción (dead code) | 30 min | ✅ Resuelto parcial (A+B) |

### Leyenda
- **P0:** Riesgo de seguridad.
- **P1:** Alto impacto en mantenibilidad.
- **P2:** Mejora de calidad, esfuerzo bajo o mediano.
- **P3:** Buenas prácticas / rendimiento marginal.
