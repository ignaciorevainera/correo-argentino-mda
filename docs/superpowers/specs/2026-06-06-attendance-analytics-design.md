# Especificación de Diseño - Panel de Estadísticas y Reportes de Asistencia Real

**Fecha**: 2026-06-06  
**Módulo**: Control de Asistencia  
**Objetivo**: Implementar una sección separada de analíticas mensuales de equipo e historial consolidado por operador para facilitar la toma de decisiones y reportes de RRHH.

---

## 1. Experiencia de Usuario e Interfaz (UI/UX)

### 1.1. Punto de Entrada
En la página principal de Control de Asistencia (`src/pages/supervision/asistencia/index.astro`), en el panel superior derecho junto al botón de "Exportar CSV", se añadirá un botón circular con el ícono `boxicons:bar-chart-alt-2` y la leyenda *"Estadísticas"*:
```html
<a 
  href={`${cleanBase}supervision/asistencia/estadisticas`} 
  class="btn btn-outline btn-sm border-base-300 text-base-content/75 hover:bg-base-200 rounded-xl px-3 w-10 h-10 flex items-center justify-center"
  title="Ver estadísticas y reportes mensuales"
>
  <Icon name="boxicons:bar-chart-alt-2" size={18} />
</a>
```

### 1.2. Estructura de la Nueva Página (`/supervision/asistencia/estadisticas`)
La página contará con una disposición premium y fluida utilizando DaisyUI y Tailwind CSS:

1.  **Cabecera de Filtros**:
    *   Botón *"Volver a Asistencia"* (redirige a `/supervision/asistencia`).
    *   Selector mensual: un input de tipo `month` (con valor inicial en el mes actual) para filtrar las analíticas en tiempo real.
2.  **Sección 1: Estadísticas Consolidadas del Equipo (Fila Superior)**:
    *   **Tarjetas Resumen (KPIs)**:
        *   Tasa de Puntualidad Promedio (%).
        *   Total de Asistencias Registradas.
        *   Días de Eventualidades / Ausencias Totales.
        *   Mayor Eventualidad del Mes.
    *   **Gráficos Interactivos (Canvas)**:
        *   *Gráfico de Eventualidades (w-1/3)*: Un gráfico circular (Doughnut) de Chart.js que muestra el desglose porcentual de los tipos de ausencias (Médicos, Vacaciones, Día OFF, etc.).
        *   *Tendencia de Puntualidad (w-2/3)*: Un gráfico de barras de Chart.js que muestra la puntualidad acumulada por semanas en el mes.
    *   **Ranking de Operadores**:
        *   Lista del Top 3 de operadores con puntualidad perfecta (100% de registros "Cumplió").
        *   Lista del Top 3 de operadores con más incidencias de puntualidad (Llegadas Tarde o Retiros Anticipados).
3.  **Sección 2: Ficha Histórica Individual (Fila Inferior)**:
    *   **Buscador autocomplete**: Permite escribir o seleccionar el nombre de un operador del equipo.
    *   **Ficha Detallada del Agente**:
        *   *KPIs*: Tasa de puntualidad individual (%), total de días laborables, cantidad de tardanzas, y total de eventualidades/ausencias.
        *   *Calendario de Cumplimiento (GitHub-Style Grid)*: Una matriz mensual de casillas por día (`1` al `31`) coloreadas en base al estado de cumplimiento (`Cumplió` en verde, `Llegada Tarde / Retiro` en amarillo, `Incumplió / Ausencia` en rojo, `Franco` o `Sin Registro` en gris base).
        *   *Hover Tooltip*: Mostrará el detalle de las horas reales registradas y el comentario/nota del supervisor si lo hubiere.

---

## 2. API y Manejo de Datos

Para optimizar recursos y mantener consistencia lógica, reutilizaremos el endpoint GET actual de asistencia:
*   **Consulta**: `GET /api/asistencia?startDate=YYYY-MM-01&endDate=YYYY-MM-31` (o la fecha de fin real del mes).
*   **Procesamiento**:
    *   El cliente llamará a la API y agrupará los datos en memoria en base al campo `date` de cada registro.
    *   Para el gráfico de eventualidades, filtrará los registros donde `ausencia` no esté vacío.
    *   Para las estadísticas individuales, filtrará los registros donde `agentId` sea el seleccionado.

---

## 3. Dependencias e Identidad Visual (Chart.js)

*   **Chart.js**: Cargada mediante CDN (`https://cdn.jsdelivr.net/npm/chart.js`) en la cabecera.
*   **Temas**: Se configurarán los colores de Chart.js utilizando el tema activo del navegador (leyendo colores de texto y cuadrícula desde los estilos computados del tema claro u oscuro de DaisyUI).
*   **Cuadrícula de Historial**:
    *   Verde: `bg-emerald-500/20 text-emerald-600 border-emerald-500/30`
    *   Amarillo: `bg-amber-500/20 text-amber-600 border-amber-500/30`
    *   Rojo: `bg-error/15 text-error border-error/30`
    *   Gris: `bg-base-200/50 border-base-300/40`

---

## 4. Plan de Verificación

*   **Compilación**: Ejecutar `npm run build` para asegurar que las importaciones y tipos de Astro sean válidos.
*   **Interactividad**:
    *   Validar que al cambiar el mes en la cabecera se actualicen dinámicamente todos los gráficos y la lista de operadores en el dropdown.
    *   Comprobar que al hacer clic en el gráfico circular o de barras se visualicen correctamente las etiquetas flotantes (tooltips).
    *   Verificar que la cuadrícula mensual de la ficha individual cambie al cambiar de operador.
