# HE Charts — Gráficos de Horas Extras en Vista Extras

## Resumen

Agregar una sección de gráficos y KPIs dentro de la vista "Extras" del Cronograma, debajo del timeline y la lista de turnos guardados. Los gráficos se renderizan del lado cliente usando Chart.js (vía CDN, mismo patrón que EstadisticasContent.astro) y se actualizan al cambiar de mes o al modificar turnos HE.

## Ubicación

- Los gráficos se insertan al final de <div id="overtime-card">, después de <div id="overtime-shifts-list"> (aprox. línea 920 de CronogramaDashboard.astro).
- No hay collapse — la sección es visible permanentemente cuando se está en la vista Extras.
- Un separador <hr> y un título "Resumen de Horas Extras" marcan el inicio de la sección.

## Componentes

### 1. KPIs — 4 tarjetas de resumen mensual

Fila flexible de 4 tarjetas con íconos:

| KPI | Fuente | Formato |
|-----|--------|---------|
| Total HE | Suma de minutos de todos los shifts del mes | HH:MM |
| Findes trabajados | Findes del mes con al menos un shift | número |
| Operadores activos | Operadores distintos con shifts en el mes | número |
| Promedio x finde | Total HE / cantidad de findes trabajados | HH:MM |

Los valores se renderizan como texto (no Chart.js). La fila usa grid CSS responsive.

### 2. Bar chart — Horas HE por operador (mes completo)

- Tipo: bar horizontal (indexAxis: 'y')
- Eje Y: nombre del operador
- Eje X: horas totales acumuladas en el mes
- Orden descendente por horas
- Tooltip: "Operador: HH:MM"
- Colores: oklch(var(--wa)) con opacidad
- Si hay más de 15 operadores, scroll vertical en el contenedor

### 3. Grilla — Findes trabajados en el mes

Tabla HTML (no Chart.js) con columnas:

| Sábado | Sábado hs | Domingo hs | Total | Operadores |
|--------|-----------|------------|-------|------------|
| 01/03 | 4:30 | 6:00 | 10:30 | badges de operadores |
| 08/03 | — | 5:00 | 5:00 | badge García |
| 15/03 | — | — | — | Sin HE |

- Filas sin HE: texto gris tenue, badge "Sin HE"
- Filas con HE: badge adge-success en Sábado/Domingo según corresponda
- Columna Operadores: badges pequeños con nombre de cada operador
- Datos agrupados por weekendStartDate

### 4. Bar chart agrupado — Horas HE por operador por finde

- Tipo: bar vertical, agrupado (dataset per operator)
- Eje X: findes del mes (etiqueta "dd/mm")
- Eje Y: horas
- Cada finde: un grupo con una barra por operador
- Colores: paleta cíclica de ~5 colores DaisyUI (warning, info, success, secondary, accent)
- Tooltip: nombre del operador, finde, horas
- Si hay más de 4 findes, scroll horizontal en el contenedor

## Chart.js loading

Mismo patrón que EstadisticasContent.astro:

`html
<script is:inline src="https://cdn.jsdelivr.net/npm/chart.js" defer></script>
`

Con safeInit() que espera window.Chart antes de crear instancias. Instancias almacenadas en variables (arChartOperatorInstance, arChartWeekendInstance) y destruidas con .destroy() antes de recrear.

## Cómputo de datos

Archivo nuevo: src/components/cronograma/lib/overtime-stats.ts

`
computeOvertimeStats(month: string) => {
  totalMinutes: number
  workedWeekends: number
  activeOperators: number
  avgPerWeekend: number
  perOperator: Array<{ name: string; minutes: number }>
  perWeekend: Array<{
    weekendStartDate: string
    saturdayMinutes: number
    sundayMinutes: number
    totalMinutes: number
    operators: string[]
  }>
  perOperatorPerWeekend: Array<{
    operatorName: string
    minutes: number
    weekendStartDate: string
  }>
}
`

- Filtra state.cronoData[].weekendOvertimes cuyos weekendStartDate empiecen con month
- Calcula duración de cada shift como 	imeToMinutes(endTime) - timeToMinutes(startTime)
- Agrupa: por operador, por finde, por operador+finde
- Retorna datos planos listos para charts y tabla

### Mes de referencia

El mes activo se obtiene del selector principal #month-selector (valor YYYY-MM-01). Se extrae el prefijo YYYY-MM y se filtran los weekendOvertime[].weekendStartDate que empiecen con ese mes. No depende del weekend picker — siempre computa sobre el mes completo.

### Refresco de stats

efreshOvertimeStats(month) se llama en dos momentos:
1. Al final de efreshOvertimeForWeekend() (después de cargar/editar shifts)
2. Después de eloadDataForActiveMonth() cuando la vista Extras está visible

## Dependencias

- Chart.js vía CDN (misma URL que EstadisticasContent.astro)
- No se agregan dependencias npm

## Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| src/components/cronograma/CronogramaDashboard.astro | Agregar HTML de KPIs + charts + tabla después de #overtime-shifts-list |
| src/components/cronograma/lib/overtime-stats.ts | **Crear**: funciones de cómputo de estadísticas |
| src/components/cronograma/lib/overtime-view.ts | Modificar: importar y llamar efreshOvertimeStats() al final de efreshOvertimeForWeekend() |
| src/components/cronograma/lib/dashboard-client.ts | Modificar: refrescar stats al cambiar de mes si la vista Extras está activa |

## Consideraciones

- No se modifica state ni se agregan nuevas propiedades globales
- Los charts se renderizan solo si la vista Extras está visible
- Los canvas se limpian con .destroy() antes de recrear
- Paleta de colores usa variables CSS de DaisyUI en lugar de rgba hardcodeado
- La grilla de findes es HTML estático (sin Chart.js)
