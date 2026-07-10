# Vista Previa Gráfica de Horas Extras (Modal)

## 1. Resumen

Agregar un botón "📊 Ver Mes" en la vista Extras del cronograma que abre un modal con un grid de tarjetas. Cada tarjeta representa un fin de semana del mes y muestra indicadores clave con un mini donut Chart.js. Al clickear una tarjeta, el modal se cierra y la vista Extras carga ese fin de semana.

## 2. Motivación

La vista Extras actual requiere seleccionar un sábado manualmente para ver el timeline. No hay forma de visualizar de un vistazo cómo está distribuida la carga de horas extras en el mes. Esta vista previa gráfica resuelve eso.

## 3. Arquitectura

### 3.1 Piezas nuevas

| Archivo | Rol |
|---|---|
| `src/pages/api/cronograma/overtime/preview.ts` | Endpoint GET que devuelve datos agregados del mes |
| `src/components/cronograma/lib/overtime-preview.ts` | Lógica JS del modal, render de tarjetas, Chart.js |

### 3.2 Cambios en archivos existentes

| Archivo | Cambio |
|---|---|
| `src/components/cronograma/CronogramaDashboard.astro` | Agregar botón "Ver Mes" + `<dialog>` modal container |
| `src/components/cronograma/lib/dashboard-client.ts` | Registrar event listener del botón |

### 3.3 Data flow

```
Usuario click "📊 Ver Mes"
  → overtime-preview.ts abre modal.showModal()
  → fetch(/api/cronograma/overtime/preview?month=YYYY-MM)
  → endpoint consulta weekend_overtime_shifts + agents, agrupa por weekendStartDate
  → response con weekends[] + currentUserId
  → render tarjetas con Chart.js donuts + indicadores condicionales
  → usuario clickea tarjeta
    → modal.close()
    → setea weekend date en state + actualiza UI del selector
    → llama a refreshOvertimeForWeekend() (existente en overtime-view.ts)
```

## 4. Endpoint: GET /api/cronograma/overtime/preview

### 4.1 Request

```
GET /api/cronograma/overtime/preview?month=2026-07
```

Query params:
- `month` (requerido): formato `YYYY-MM`

Auth: requiere sesión activa. Mínimo rol `agent`.

### 4.2 Lógica

1. Parsear `month` → calcular el rango del mes (primer día, último día)
2. Identificar todos los sábados del mes (día 6)
3. Para cada sábado, calcular `weekendStartDate` (el sábado) y `sundayDate` (sábado + 1)
4. Query a `weekend_overtime_shifts` donde `weekendStartDate` IN (lista de sábados del mes)
5. Join con `agents` para obtener `agentName`
6. Para cada `weekendStartDate`, calcular:
   - `totalHours`: suma de duración de todos los shifts (fin - inicio, en horas, con 1 decimal)
   - `operatorCount`: cantidad de `agentId` distintos
   - `shifts[]`: array con `agentId`, `agentName`, `day` ("saturday"|"sunday"), `startTime`, `endTime`, `hours`
   - `currentUserHasShift`: true si algún shift tiene `agentId === currentUserId`
7. Ordenar `weekends[]` por fecha ascendente

### 4.3 Response

```typescript
{
  weekends: {
    startDate: string;         // "2026-07-11"
    saturdayDate: string;      // "2026-07-11"
    sundayDate: string;        // "2026-07-12"
    totalHours: number;        // 35.5
    operatorCount: number;     // 6
    currentUserHasShift: boolean;
    shifts: {
      agentId: number;
      agentName: string;
      day: "saturday" | "sunday";
      startTime: string;       // "14:00"
      endTime: string;         // "18:00"
      hours: number;           // 4
    }[];
  }[];
  currentUserId: number;
  month: string;
}
```

### 4.4 Errores

| Código | Caso | Respuesta |
|---|---|---|
| 400 | `month` inválido o faltante | `{ error: "Parámetro month requerido (YYYY-MM)" }` |
| 401 | No autenticado | `{ error: "No autorizado" }` |
| 500 | Error interno | `{ error: "Error al obtener datos" }` |

## 5. Frontend: overtime-preview.ts

### 5.1 Funciones

| Función | Responsabilidad |
|---|---|
| `openOvertimePreview(month?: string)` | Calcula mes actual si no se pasa, fetch al endpoint, renderiza modal |
| `renderPreviewModal(data, monthStr)` | Inyecta HTML del modal (header con navegación de meses + grid de tarjetas), llama a initCharts() después de render |
| `renderCard(weekend, currentUserId)` | Genera HTML de 1 tarjeta con indicadores condicionales |
| `initCharts()` | Espera a window.Chart, instancia Chart.js donut en cada canvas |
| `setupCardClickHandlers(data)` | Registra click en tarjetas → cierra modal, setea weekend, refresca vista Extras |
| `previewNavigateMonth(delta: -1\|1)` | Mueve mes anterior/siguiente, re-fetch y re-render |

### 5.2 Estados del modal

| Estado | Visual |
|---|---|
| **Loading** | Skeleton de 4 tarjetas con animate-pulse |
| **Empty** | "No hay horas extras cargadas para este mes" + icono calendario vacío |
| **Error** | "Error al cargar datos" + botón reintentar |
| **Data** | Grid de tarjetas con mini donuts |

### 5.3 Tarjeta: diseño

```
┌──────────────────────────────┐
│         ╭─────╮              │
│         │ 35  │              │
│         │ hs  │              │
│         ╰─────╯              │ ← Mini donut Chart.js con totalHours al centro
│   Sáb 11 y Dom 12 Jul        │ ← Fecha legible
│                              │
│   [Condición A o B]          │
└──────────────────────────────┘
```

### 5.4 Condiciones de contenido

**Condición A (usuario TIENE turno en ese fin de semana):**
- Badge: `✅ ESTÁS ASIGNADO` (verde, fondo success/10)
- Su turno: "Sábado 14:00 a 18:00 (4 hs)"
- Compañeros: "En tu guardia: Matías G., Lucas M."
- Métrica secundaria: "Horas totales: 35 hs" (discreta, abajo)

**Condición B (usuario NO tiene turno):**
- Indicador: `FIN DE SEMANA LIBRE` (gris, badge neutro)
- Métrica 1: "Horas totales: 35 hs" (destacada)
- Métrica 2: "Operadores: 6" (secundaria)

### 5.5 Chart.js integración

Carga via CDN existente (`https://cdn.jsdelivr.net/npm/chart.js`). Mismo patrón que `EstadisticasContent.astro`: script inline con `defer`.

Config del donut (100% sólido, segmento único, sin métrica de tope):
```ts
new Chart(ctx, {
  type: 'doughnut',
  data: {
    datasets: [{
      data: [1], // segmento único, donut 100% lleno
      backgroundColor: ['#f59e0b'], // warning
      borderWidth: 0,
      cutout: '78%',
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      tooltip: { enabled: false },
      legend: { display: false }
    }
  }
});
```

El texto "35 hs" al centro se renderiza como HTML superpuesto al canvas (no como plugin de Chart.js).

### 5.6 Navegación entre meses

El modal tiene flechas `<` `>` en el header para cambiar de mes. Al navegar:
- Se actualiza el título "Resumen de Horas Extras — Julio 2026"
- Se vuelve a llamar al endpoint con el nuevo mes
- Se reemplaza el grid de tarjetas
- Las instancias previas de Chart.js se destruyen antes de crear nuevas

## 6. Cambios en CronogramaDashboard.astro

### 6.1 Botón "Ver Mes"

Dentro del div `overtime-card`, en el bloque del selector de sábado (~línea 717), justo después del `overtime-weekend-date-wrapper`:

```html
<button type="button" id="open-overtime-preview-btn"
  class="btn btn-xs btn-ghost text-warning gap-1 shrink-0"
  title="Ver resumen mensual de horas extras">
  <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
  <span class="text-xxs font-black uppercase tracking-wider hidden sm:inline">Ver Mes</span>
</button>
```

### 6.2 Modal container

Agregar al final del div `overtime-view`, antes del cierre:

```astro
<dialog id="overtime-preview-modal" class="modal">
  <div class="modal-box max-w-5xl p-6 min-h-[300px]">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
    </form>
    <div id="overtime-preview-content">
      <!-- Renderizado por overtime-preview.ts -->
      <div class="flex items-center justify-center py-16 text-base-content/30">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>cerrar</button>
  </form>
</dialog>
```

## 7. Cambios en dashboard-client.ts

Agregar evento en `setupOvertimeEventListeners()`:

```ts
document.getElementById('open-overtime-preview-btn')?.addEventListener('click', () => {
  import('./overtime-preview').then(m => m.openOvertimePreview());
});
```

`openOvertimePreview()` deriva el mes del input de fecha si hay uno seleccionado, o usa el mes actual.

## 8. Chart.js carga

Agregar script CDN de Chart.js al final de `CronogramaDashboard.astro`, mismo CDN que usa `EstadisticasContent.astro`:

```astro
<script is:inline src="https://cdn.jsdelivr.net/npm/chart.js" defer></script>
```

## 9. Testing

### 9.1 E2E (Playwright)

1. Abrir `/supervision/cronograma`
2. Click en "Extras"
3. Click en "Ver Mes"
4. Verificar que el modal se abre con skeleton loading
5. Esperar a que carguen tarjetas
6. Verificar que se muestra el donut de Chart.js
7. Click en una tarjeta → modal se cierra → selector de fecha muestra ese sábado
8. Navegación de meses (< >) funciona

## 10. No incluido (alcance)

- No se modifica el timeline existente de overtime-view.ts
- No se toca el CRUD de turnos
- No se cambia el view-switcher (no hay botón nuevo)
- No se agregan nuevas tablas a la DB