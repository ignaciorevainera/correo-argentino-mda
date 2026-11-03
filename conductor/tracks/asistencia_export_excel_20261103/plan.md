# Implementation Plan: Exportación Excel (.xlsx) Control de Asistencia

## Phase 1: Builder y Estructura XLSX de Asistencia
- [ ] Task: Definir generador de hoja Excel para asistencia en `@lib/attendanceExport.ts` (o extensión de `@lib/xlsx.ts`) con anchos, estilos y columnas exactas de `Portal MDA - Asistencia.xlsx`.
- [ ] Task: Test de dominio / unitario verificando la generación del buffer XLSX, cantidad de columnas (9) y metadatos correctos.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Endpoint API Backend
- [ ] Task: Crear endpoint `src/pages/api/asistencia/export-excel.ts` con protección RBAC (`requireReadAccess(locals, "asistencia")`) y parámetros de fecha `date=YYYY-MM-DD`.
- [ ] Task: Probar endpoint vía request simulado / test de endpoint validando headers MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) y Content-Disposition.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Integración en UI (Control de Asistencia)
- [ ] Task: Agregar botón "Exportar Excel (.xlsx)" en la barra de herramientas de `src/components/supervision/asistencia/AsistenciaContent.astro`.
- [ ] Task: Enlazar evento click del botón con descarga directa vía URL hacia el endpoint para la fecha seleccionada.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Verificación Integral
- [ ] Task: Verificar que el archivo generado coincida exactamente en columnas y formato con `Portal MDA - Asistencia.xlsx`.
- [ ] Task: Ejecutar suite de pruebas de dominio (`npm run test:domain`) y verificar que no existan regresiones.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
