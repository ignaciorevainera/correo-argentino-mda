# Auditoría de performance — Cronograma (propuesta mínima, YAGNI-bounded)

Fecha: 2026-08-24 · Branch: `feat/cronograma-ui-improvements`

## Estado actual (ya está bien)

- **Lazy imports por vista**: `dashboard-client.ts` carga `pasiva-view`, `overtime-view`,
  `overtime-preview` y `exporters` con `import()` dinámico (líneas 289, 298, 1692, 1729,
  2401, 2413, 2423). `exporters.ts` además hace lazy de `html-to-image` y ExcelJS (líneas
  10, 20, 284).
- **Render por string-building**: `renderMonthly` / `renderDaily` construyen HTML en un
  string y hacen **un solo** `innerHTML` por tabla (`monthly-view.ts:1148`). Sin writes
  de DOM por celda.
- **Búsqueda con debounce**: `handleSearchInput` usa `debounce(..., 150)`
  (`dashboard-client.ts:1270`).
- **Delegación de eventos**: clicks/hover de la grilla mensual van por listeners
  delegados en `monthlyBody`, no por celda (`dashboard-client.ts:1121-1349`).

## Hallazgos

| # | Ubicación | Problema | Impacto |
|---|-----------|----------|---------|
| 1 | `drawer.ts:258` y `drawer.ts:312` | Guardar un campo único (location / reglas) despacha `cronograma:data-changed`, que dispara `reloadDataForActiveMonth()` (`dashboard-client.ts:264-300`): refetch completo del mes por red + `renderDaily` + `renderMonthly` + selectores. El estado local ya fue parcheado antes del dispatch (drawer.ts:242-245, 295-299), así que el refetch es redundante para este caso. | **Medio-alto** (latencia de red en cada guardado chico; parpadeo de re-render total) |
| 2 | `dashboard-client.ts:1270-1281` | Cada tecla (post-debounce) re-renderiza **ambas** vistas (monthly + daily) aunque solo una es visible; la mensual es la más pesada (~ops × 31 celdas). | **Bajo-medio** |
| 3 | `overtime-view.ts:232-239, 258` | El comparador del sort llama `getOpEarliestStart`, que filtra `shifts` en cada comparación → O(n log n × m); además `shifts.filter` por operador dentro del map de filas. Con n ≈ decenas, despreciable. | **Bajo** |
| 4 | `document` mouseover/mouseout globales (`dashboard-client.ts:2474-2494`) | Corren en cada hover de la página, pero el guard `closest(".daily-break-badge")` es barato. | **Bajo** |

Verificado sin problemas: `renderMonthly` precalcula coverage/reglas fuera de los loops
de fila (`monthly-view.ts:1006-1088`) y no hace `getElementById`/`querySelectorAll`
dentro de loops. No se detectó O(n²) real en hot paths.

## Propuestas mínimas

1. **(Hallazgo 1)** Nuevo evento granular `cronograma:operator-patched` que solo
   re-renderice las vistas activas usando el estado ya parcheado, reservando
   `data-changed` (full refetch) para cambios masivos como `weekly-schedule.ts:538`.
   *Costo*: bajo (un listener + cambiar 2 dispatches). *Vale la pena si* los guardados
   del drawer se perciben lentos o parpadean.
2. **(Hallazgo 2)** En `handleSearchInput`, renderizar solo la vista visible
   (chequear `.hidden`) y marcar la otra como stale para render on-show.
   *Costo*: muy bajo. Ganancia modesta; hacer solo si queda barato.

## Explícitamente "no action"

- Hallazgo 3 (sort/filter de overtime): n pequeño, refactor no justifica el riesgo.
- Hallazgo 4 (hover globals): costo de CPU imperceptible.
- Migrar renders a framework/virtual scrolling: tablas son ~ops × 31 celdas,
  el innerHTML único ya es suficientemente rápido. YAGNI.
