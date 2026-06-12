# Spec: Monitoreo y Sincronización en Panel de Administración

## Resumen
Refactorizar la sección de estado de sincronización de la página de administración (`src/pages/admin/index.astro`) para convertirla en un componente reutilizable y robusto. La interfaz mostrará dos indicadores en tarjetas estadísticas separadas de DaisyUI: uno para la sincronización de inventario legado y otro para el radar de ping de las Cubics. Los datos se actualizarán dinámicamente mediante un endpoint API extendido.

## Requerimientos
1. **API de Estado (`/api/admin/sync-status`)**:
   - Consultar PM2 para obtener el estado actual (`online`, `stopped` o `errored`) y uptime de los procesos `sync-legacy-inventory` y `mda-ping-cubics`.
   - Leer el archivo `src/data/last-sync-status.json` para obtener los detalles de la última sincronización ejecutada (marca de tiempo, resultado "success"/"error", y detalle de errores si los hubiera).
   - Realizar una consulta a la base de datos SQLite para obtener la fecha más reciente de `lastPing` registrada en la tabla `cubics` (radar de ping).
2. **Componente de Dashboard (`SyncDashboard.astro`)**:
   - Renderizar una grilla de dos columnas con componentes `.stat` de DaisyUI.
   - Tarjeta 1: **Sincronización de Terminales**
     - Muestra el estado del proceso en PM2 (ej. "En Ejecución", "Detenido").
     - Muestra el resultado de la última sincronización y su hora de finalización.
   - Tarjeta 2: **Monitoreo de Cubics (Ping)**
     - Muestra el estado de la tarea persistente en PM2 (ej. "Activo", "Inactivo").
     - Muestra la hora del último ping general registrado a cualquier cubic.
   - Incluir código JS de cliente para consultar la API cada 30 segundos, formatear las fechas con la configuración regional del navegador y aplicar los colores semánticos (`text-success`, `text-error`, `text-warning`) según el estado de cada proceso de manera segura y eficiente.
3. **Página de Administración (`src/pages/admin/index.astro`)**:
   - Importar y emplear `<SyncDashboard />` en reemplazo del bloque actual de la grilla de sincronización.

## Diseño de la API
El payload JSON devuelto por `GET /api/admin/sync-status` tendrá la siguiente estructura:
```json
{
  "sync": {
    "status": "online" | "stopped" | "errored",
    "lastExecution": "2026-06-12T04:10:00.000Z" | null,
    "lastStatus": "success" | "error" | null,
    "error": "Mensaje en caso de falla" | null
  },
  "ping": {
    "status": "online" | "stopped" | "errored",
    "lastPing": "2026-06-12T04:12:00.000Z" | null
  }
}
```

## Arquitectura y Componentes
- `src/pages/api/admin/sync-status.ts` (Endpoint modificado)
- `src/components/admin/SyncDashboard.astro` (Nuevo componente)
- `src/pages/admin/index.astro` (Página modificada)
