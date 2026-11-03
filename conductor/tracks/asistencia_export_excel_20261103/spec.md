# Specification: Exportación Excel (.xlsx) Control de Asistencia

## 1. Overview
Incorporar la funcionalidad de exportación a Microsoft Excel (`.xlsx`) en la vista de **Control de Asistencia Diaria** (`/supervision/asistencia`), manteniendo paridad arquitectónica con el módulo de Calidad (`/api/calidad/export-excel` y `@lib/xlsx`), replicando con fidelidad exacta la estructura de 9 columnas, anchos y estilos del archivo modelo `Portal MDA - Asistencia.xlsx`.

## 2. Functional Requirements
- **Botón en interfaz**:
  - Ubicado en la barra superior de acciones de `src/components/supervision/asistencia/AsistenciaContent.astro`, junto al botón existente "Exportar CSV".
  - Etiqueta: "Exportar Excel (.xlsx)".
- **Endpoint de backend**:
  - `GET /api/asistencia/export-excel?date=YYYY-MM-DD`.
  - Seguridad y RBAC: requiere permiso de lectura sobre el módulo `"asistencia"` (`requireReadAccess(locals, "asistencia")`).
  - Obtiene los registros consolidados del día usando `getAttendanceData(date, date)` desde `@lib/attendance`.
  - Exporta todos los registros del día seleccionado sin aplicar búsqueda/filtros volátiles del cliente.
- **Formato del archivo Excel (`.xlsx`)**:
  - Nombre de archivo: `asistencia_YYYY-MM-DD.xlsx` o `Portal MDA - Asistencia - YYYY-MM-DD.xlsx`.
  - Nombre de la hoja: `Hoja1`.
  - 9 Columnas exactas:
    1. `Operador`
    2. `Sede`
    3. `Asistencia Real`
    4. `Ausencia/Eventualidad`
    5. `Horario Estipulado`
    6. `Entrada Real`
    7. `Cumplimiento`
    8. `Motivo Login`
    9. `Detalle/Comentario`
  - Anchos de columna, bordes y estilos alineados con la plantilla `Portal MDA - Asistencia.xlsx`.

## 3. Acceptance Criteria
- [ ] Botón funcional en la UI de Control de Asistencia que dispara la descarga directa del `.xlsx`.
- [ ] Endpoint `GET /api/asistencia/export-excel` protegido con RBAC.
- [ ] Archivo generado abre en Microsoft Excel y visores compatibles sin advertencias de formato corrupto.
- [ ] Contenido idéntico en estructura y columnas al archivo de referencia `Portal MDA - Asistencia.xlsx`.
