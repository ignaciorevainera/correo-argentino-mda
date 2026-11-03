# Implementation Plan: Exportación Excel (.xlsx) Control de Asistencia

## Phase 1: Builder y Estructura XLSX de Asistencia
- [x] Task: Definir generador de hoja Excel para asistencia en `@lib/attendanceExport.ts` (o extensión de `@lib/xlsx.ts`) con anchos, estilos y columnas exactas de `Portal MDA - Asistencia.xlsx`.
- [x] Task: Test de dominio / unitario verificando la generación del buffer XLSX, cantidad de columnas (9) y metadatos correctos.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Endpoint API Backend
- [x] Task: Crear endpoint `src/pages/api/asistencia/export-excel.ts` con protección RBAC (`requireReadAccess(locals, "asistencia")`) y parámetros de fecha `date=YYYY-MM-DD`.
- [x] Task: Probar endpoint vía request simulado / test de endpoint validando headers MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) y Content-Disposition.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Integración en UI (Control de Asistencia)
- [x] Task: Agregar botón "Exportar Excel (.xlsx)" en la barra de herramientas de `src/components/supervision/asistencia/AsistenciaContent.astro`.
- [x] Task: Enlazar evento click del botón con descarga directa vía URL hacia el endpoint para la fecha seleccionada.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Verificación Integral
- [x] Task: Verificar que el archivo generado coincida exactamente en columnas y formato con `Portal MDA - Asistencia.xlsx`.
- [x] Task: Ejecutar suite de pruebas de dominio (`npm run test:domain`) y verificar que no existan regresiones.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
