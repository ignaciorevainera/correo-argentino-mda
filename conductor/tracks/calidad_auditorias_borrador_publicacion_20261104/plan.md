# Implementation Plan: Ciclo de Vida Borrador / Publicado para Auditorías de Calidad

## Phase 1: Esquema de Base de Datos y Modelo de Dominio (TDD) [checkpoint: 41650a8]
- [x] Task: Escribir tests de dominio para validación y filtrado por estado de auditoría
  - [ ] Crear suite de pruebas para el enum de estados (`draft`, `published`) y funciones de servicio
  - [ ] Verificar que los tests fallen inicialmente (Red phase)
- [x] Task: Actualizar esquema Drizzle y alinear base de datos
  - [ ] Agregar columna `status: text("status").notNull().default("draft")` en `quality_audits` (`src/db/schema.ts`)
  - [ ] Ejecutar script de alineación de schema (`scripts/align-db-to-schema.mts`) verificando que los registros históricos queden en `'draft'`
  - [ ] Hacer pasar los tests de dominio (Green phase)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Lógica de Guardado y Actions de Publicación (TDD) [checkpoint: 2615a69]
- [x] Task: Escribir tests unitarios/de integración para actions de publicación
  - [ ] Tests de autorización (rechazar roles de operador, permitir supervisor/admin)
  - [ ] Tests de mutación individual (`publishAudit(id)`) y en lote (`publishAuditsBatch(agentId, month)`)
  - [ ] Tests de persistencia por defecto en `draft` en la creación de auditorías
- [x] Task: Implementar actions y endpoints seguros de publicación
  - [ ] Adaptar acción de creación en `src/actions/index.ts` para forzar `status = "draft"`
  - [ ] Crear acción o endpoint `publishQualityAudit` (individual) y `publishQualityAuditsBatch` (lote) con `logAdminAction`
  - [ ] Hacer pasar los tests unitarios (Green phase)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Aislamiento y Visibilidad en el Panel del Operador (TDD) [checkpoint: 38607d5]
- [x] Task: Escribir tests para el resumen y widgets del operador
  - [ ] Verificar que `qualitySummary` y cálculos de KPIs ignoren por completo auditorías en `draft`
  - [ ] Verificar que un operador con solo borradores no vea notas ni auditorías en su inicio
- [ ] Task: Implementar filtro `status = 'published'` en consultas del operador
  - [ ] Actualizar `src/lib/inicio/qualitySummary.ts` para filtrar por `status = 'published'`
  - [ ] Actualizar `src/components/inicio/QualityPanel.astro` para excluir borradores
  - [ ] Verificar paso de tests de dominio (`npm run test:domain`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: UI de Supervisión: Badges, Acciones y Modales de Confirmación
- [x] Task: Agregar badges semánticos de estado en la interfaz de supervisión
  - [ ] Renderizar badge de "Borrador" (`badge-warning`/`badge-ghost`) y "Publicado" (`badge-success`) en las tarjetas y listas de auditorías
- [x] Task: Implementar modales de confirmación y botones de publicación
  - [ ] Botón "Publicar" en cada auditoría en borrador con modal de confirmación rápida
  - [ ] Botón "Publicar pendientes" en la cabecera del operador/mes con modal de confirmación masiva
  - [ ] Feedback con toasts y recarga/actualización fluida del estado en pantalla
- [~] Task: Phase Verification & Checkpoint (Refer to workflow.md)
