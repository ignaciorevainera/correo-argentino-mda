# Especificación: Métricas y Estadísticas de Autogestiones

## 1. Overview
Crear una nueva página dedicada e interactiva bajo `/supervision/autogestiones-metricas` para supervisores, líderes de equipo y administradores, permitiendo monitorear, analizar y exportar métricas operativas clave del flujo de autogestiones. La visualización de datos se implementará utilizando **Chart.js** cargado vía CDN (jsDelivr), siguiendo los patrones de rendimiento y UI del portal.

## 2. Requisitos Funcionales

### 2.1. Navegación y Control de Acceso (RBAC)
- **Ruta:** `/supervision/autogestiones-metricas`.
- **Permisos:** Roles `supervisor`, `team_leader` y `admin` (conforme a `src/lib/rbac.ts`).
- **Navegación:** Registrar en `src/lib/navigation.ts` dentro de la sección "Supervisión", junto a *Asignación de autogestiones*, e incluir acceso cruzado/botón directo entre ambas pantallas.

### 2.2. Panel Superior de Filtros y Controles
- **Selector de Rango Temporal:**
  - Presets rápidos: *Hoy*, *Ayer*, *Últimos 7 días*, *Últimos 30 días*, *Mes actual*.
  - Rango de fechas personalizado (*Desde / Hasta*).
- **Acciones Rápidas:**
  - Botón de refresco manual de datos en vivo con badge de "Última sincronización".
  - Botón de **Exportación a CSV / Excel** con el desglose de asignaciones del período seleccionado.

### 2.3. KPIs Resumen (Tarjetas Superiores)
- **Total Asignadas:** Suma total de autogestiones entregadas en el período.
- **Cola Pendiente en InvGate:** Cantidad de tickets sin asignar en la mesa AGS en tiempo real.
- **Tasa de Automatización / Cíclica:** % de asignaciones realizadas automáticamente vs. manuales.
- **Operadores Activos:** Cantidad de operadores únicos que recibieron tickets en el período.

### 2.4. Gráficos Interactivos (Chart.js vía CDN)
1. **Volumen Temporal de Asignaciones (Bar / Line Chart):**
   - Evolución de tickets asignados por día (o por hora si el filtro es "Hoy" / "Ayer").
2. **Distribución de Carga por Operador (Horizontal Bar Chart):**
   - Comparativa de cantidad de autogestiones asignadas por operador para auditar equidad de carga.
3. **Desglose por Modalidad de Asignación (Doughnut Chart):**
   - Proporción entre asignación cíclica (`cyclic`), manual (`manual`), sugerida por creador (`batch_suggested`), masiva en cola (`batch_all`), y revisiones (`revision`).
4. **Composición de Cola en Vivo por Categoría (Doughnut / Bar Chart):**
   - Distribución temática de los tickets actualmente en cola de InvGate según su categoría.
5. **Top Creadores / Sucursales Solicitantes (Bar Chart o Ranking List):**
   - Identificación de las dependencias o usuarios con mayor volumen de solicitudes ingresadas.

### 2.5. Tabla de Detalle y Auditoría
- Tabla paginada o con scroll de asignaciones recientes con columnas: Fecha/Hora, N° Ticket (enlace a InvGate), Operador Asignado, Asignado Por (Sistema / Supervisor), Tipo de Asignación.

## 3. Requisitos No Funcionales y Arquitectura
- **Carga de Chart.js:** Vía CDN `<script is:inline src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>` con fallback de espera reactivo en cliente.
- **DaisyUI v5 & Tailwind:** Uso estricto de tokens temáticos de DaisyUI (`primary`, `secondary`, `base-100`, `base-200`, `border-base-300`, `text-base-content`), sin colores hexadecimales hardcodeados.
- **Server Islands / SSR:** Página estructurada con layout base del portal, carga diferida (`server:defer`) con skeleton de carga (`AutogestionesMetricasSkeleton.astro`) para mantener tiempos de respuesta inmediatos.
- **Endpoint API o Carga SSR:** Ruta API o función de agregación en servidor (`/api/autogestion/metricas` o carga directa en Astro) con agregaciones SQLite eficientes (`GROUP BY`, índices de `assigned_at`).

## 4. Criterios de Aceptación
- [ ] La nueva ruta `/supervision/autogestiones-metricas` carga sin errores para usuarios con rol `supervisor`, `team_leader` o `admin`, y bloquea a roles no autorizados.
- [ ] Los gráficos de Chart.js se renderizan reactivamente respondiendo al cambio de filtros de fecha.
- [ ] Las métricas de asignación coinciden exactamente con los registros de la tabla `assignment_history`.
- [ ] La cola en vivo refleja las solicitudes abiertas de la mesa de autogestiones en InvGate sin generar saturación de llamadas API.
- [ ] El botón de exportación genera un archivo `.csv`/`.xlsx` coherente con los datos visualizados.
- [ ] El diseño responde adecuadamente tanto en resoluciones de escritorio como en pantallas medianas/móviles.

## 5. Fuera de Alcance (Out of Scope)
- Modificación de los algoritmos de asignación o de las reglas del motor de autogestiones.
- Edición o reasignación masiva de tickets desde la pantalla de estadísticas.
