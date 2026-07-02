# Auditoría — Hallazgos Pendientes

**Fecha:** 2026-07-01 (6.ª pasada)
**Base:** auditoría 2026-06-24, depurada de hallazgos resueltos total (20)

---

## Resumen

| Estado | Cantidad |
|--------|----------|
| 🔴 Pendientes | 6 items |
| ✅ Resueltos (acumulado histórico) | 20 |

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

### N3.9 🟡 `text-tiny font-black uppercase tracking-wider` 35 veces

Aparece exclusivamente en `CronogramaDashboard.astro` (33) + `monthly-view.ts` (1) + `weekly-schedule.ts` (1). Sin cambios vs pasada anterior.

**Fix:** Extraer a clase CSS compartida o componente `SectionHeading`.
**Esfuerzo:** 15 min.
**Impacto:** Mantenibilidad.

---

## P3 — Buenas prácticas / rendimiento marginal

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

---

## Plan de Acción

| Prioridad | ID | Hallazgo | Esfuerzo | Impacto |
|-----------|----|----------|----------|---------|
| **P0** | 1.5 | 🔴 `security.checkOrigin: false` | 5 min | Seguridad |
| **P1** | 3.1 | 🔴 15 diálogos raw sin Modal.astro | 2-3 h | -300+ líneas |
| **P1** | N3.11 | 🟡 Botones repetidos (18 instancias) | 30 min | -50+ líneas |
| **P2** | N3.9 | 🟡 `text-tiny font-black` 35 veces | 15 min | Mantenibilidad |
| **P3** | 4.1 | 🟢 Migrar TitleDrawer + Skeleton a Astro | 1 h | -100+ líneas React |
| **P3** | 4.1 | 🟢 Migración React completa | 3-4 h | Toolchain simplificada |

### Leyenda
- **P0:** Riesgo de seguridad.
- **P1:** Alto impacto en mantenibilidad.
- **P2:** Mejora de calidad, esfuerzo bajo o mediano.
- **P3:** Buenas prácticas / rendimiento marginal.
